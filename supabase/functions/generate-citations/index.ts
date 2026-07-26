// Phase 3, Paket 4 (umgeplant): Zitate auf Abruf.
//
// Kein Batch mehr über den Bestand - der Nutzer klickt "Zitate erzeugen" an
// einer Quelle, diese Function laeuft synchron innerhalb des Klicks und
// liefert die Kandidaten direkt zur Pruefung zurueck. Claude- und
// Voyage-Keys duerfen nie ins Browser-Bundle, deshalb laeuft der komplette
// Aufruf serverseitig (gleiches Prinzip wie die "search"-Function aus
// Phase 2, Paket 8). Portierte Logik aus worker/littool_worker/passages.py
// (Prompt, Verifikation, Zitations-Berechnung) - dort lief sie bisher nur
// als lokaler Batch-Job.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3.5";
const OUTPUT_DIMENSION = 1024; // Entscheidung aus Phase 2, Paket 1

const MAX_CANDIDATE_CHUNKS = 6;
const MAX_TOKENS = 2000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du extrahierst wörtliche Zitate aus wissenschaftlichen Quellen für eine \
Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung.

Du bekommst eine Forschungsfrage und Textauszüge aus einer Quelle. Extrahiere NUR Passagen, \
die WÖRTLICH (Zeichen für Zeichen, inkl. Zeichensetzung) in den unten stehenden Textauszügen \
vorkommen - erfinde nichts und paraphrasiere nicht. Auch wenn du die Originalarbeit aus deinem \
Trainingswissen kennst (z. B. bei bekannten Klassikern): zitiere AUSSCHLIESSLICH aus den unten \
gegebenen Auszügen, niemals aus dem Gedächtnis. Ein Zitat, das nicht Zeichen für Zeichen in den \
Auszügen unten steht, gehört nicht in die Antwort - auch wenn es inhaltlich plausibel klingt.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor \
oder danach und ohne Markdown-Codeblock:

{
  "passages": [
    {"original": "<wörtliches Zitat, exakt wie im Text>", "translation": "<deutsche Übersetzung>", "relevance": <1-3>}
  ]
}

Regeln:
- "original": muss wortwörtlich aus den Textauszügen stammen, ohne eigene Ergänzungen.
- Nutze NIEMALS Einträge aus einem Literaturverzeichnis/Referenzenliste als Zitat - das sind \
Verweise auf andere Werke, keine inhaltlichen Aussagen der Quelle selbst. Erkennbar an typischem \
Referenz-Format (Autor, Jahr, Titel, Journal/Verlag, Seitenzahlen einer anderen Publikation).
- Wenn nichts Zitierfähiges zur Forschungsfrage passt: "passages": [] (leeres Array).
- "translation": sinngemäße, flüssige deutsche Übersetzung des Zitats.
- relevance: 1 = am Rande relevant, 2 = relevant, 3 = zentral relevant für die Forschungsfrage.
- Maximal 4 Passagen, wähle die aussagekräftigsten aus.
- WICHTIG - gültiges JSON: Enthält "original" oder "translation" selbst ein Zitat in
  Anführungszeichen, escape JEDES gerade Anführungszeichen (") als \\" - auch wenn es Teil
  einer deutschen „…"-Konstruktion ist. Beispiel für korrektes Escaping:
  {"original": "he called it \\"aligning\\" rather than alignment", "translation": "er nannte es „aligning\\" statt Alignment", "relevance": 2}
  Verwende niemals ein einzelnes unescaped " innerhalb eines Textwerts.
`;

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
};

// Whitespace vereinheitlichen + Ligatur-Glyphen aufloesen, siehe passages.py
// (_normalize) - reine Darstellungsfrage, schwaecht die Verifikation nicht.
function normalize(text: string): string {
  let result = text;
  for (const [ligature, expanded] of Object.entries(LIGATURES)) {
    result = result.replaceAll(ligature, expanded);
  }
  return result.trim().replace(/\s+/g, " ");
}

type Chunk = { chunk_id: string; page: number; chunk_index: number; text: string };

function findSourceChunk(original: string, chunks: Chunk[]): Chunk | null {
  const normalizedOriginal = normalize(original);
  if (!normalizedOriginal) return null;
  for (const chunk of chunks) {
    if (normalize(chunk.text).includes(normalizedOriginal)) return chunk;
  }
  return null;
}

type SourceRow = {
  id: string;
  title: string;
  authors: unknown;
  year: number | null;
  page_offset: number | null;
};

type Rq = { id: string; code: string; question: string };

function buildUserPrompt(source: SourceRow, rq: Rq, chunks: Chunk[]): string {
  const chunksBlock = chunks.map((c) => `[S. ${c.page}] ${c.text}`).join("\n\n");
  return (
    `Forschungsfrage ${rq.code}: ${rq.question}\n\n` +
    `Quelle: ${source.title} (${source.year ?? "o. J."})\n\n` +
    `Textauszüge aus der Quelle:\n${chunksBlock}`
  );
}

type Candidate = { original: string; translation: string; relevance: number };

function parseClaudeResponse(text: string): Candidate[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(cleaned);
  const out: Candidate[] = [];
  for (const entry of data.passages ?? []) {
    if (typeof entry.original !== "string" || !entry.original.trim()) {
      throw new Error(`leeres/ungültiges 'original' in Antwort: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.translation !== "string" || !entry.translation.trim()) {
      throw new Error(`leeres/ungültiges 'translation' in Antwort: ${JSON.stringify(entry)}`);
    }
    if (!Number.isInteger(entry.relevance) || entry.relevance < 1 || entry.relevance > 3) {
      throw new Error(`ungültige Relevanz in Antwort: ${JSON.stringify(entry)}`);
    }
    out.push({ original: entry.original, translation: entry.translation, relevance: entry.relevance });
  }
  return out;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type ResultItem = {
  id: string;
  research_question_id: string;
  research_question_code: string;
  page: number;
  original: string;
  translation: string;
  citation: string;
  relevance: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Nur POST erlaubt" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Fehlende Authorization" }, 401);
  }

  let body: { source_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const sourceId = body.source_id;
  if (!sourceId) {
    return jsonResponse({ error: "source_id fehlt" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  if (!anthropicKey || !voyageKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY oder VOYAGE_API_KEY nicht gesetzt" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, title, authors, year, page_offset")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) {
    return jsonResponse({ error: sourceError?.message ?? "Quelle nicht gefunden" }, 404);
  }

  const { data: relevancePairs, error: relevanceError } = await supabase
    .from("source_rq_relevance")
    .select("research_question_id, research_questions(id, code, question)")
    .eq("source_id", sourceId)
    .gte("relevance", 1);
  if (relevanceError) {
    return jsonResponse({ error: relevanceError.message }, 500);
  }

  const rqs: Rq[] = (relevancePairs ?? [])
    .map((p) => p.research_questions as unknown as Rq)
    .filter((rq): rq is Rq => Boolean(rq));

  if (rqs.length === 0) {
    return jsonResponse(
      { results: [], errors: [], discarded: 0, message: "Keine Forschungsfrage mit Relevanz für diese Quelle." },
      200,
    );
  }

  // Alle RQ-Fragen in einem Voyage-Aufruf einbetten statt n einzelne Aufrufe.
  const voyageResp = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${voyageKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: rqs.map((rq) => rq.question),
      model: VOYAGE_MODEL,
      input_type: "query",
      output_dimension: OUTPUT_DIMENSION,
    }),
  });
  if (!voyageResp.ok) {
    const text = await voyageResp.text();
    return jsonResponse({ error: `Voyage-Fehler ${voyageResp.status}: ${text}` }, 502);
  }
  const voyageData = await voyageResp.json();
  const embeddings: number[][] = voyageData.data.map((d: { embedding: number[] }) => d.embedding);

  const results: ResultItem[] = [];
  const errors: Array<{ research_question_code: string; message: string }> = [];
  let discardedTotal = 0;

  for (let i = 0; i < rqs.length; i++) {
    const rq = rqs[i];
    const embedding = embeddings[i];

    const { data: chunks, error: chunksError } = await supabase.rpc("search_chunks_within_source", {
      query_embedding: embedding,
      filter_source_id: sourceId,
      match_limit: MAX_CANDIDATE_CHUNKS,
    });
    if (chunksError) {
      errors.push({ research_question_code: rq.code, message: chunksError.message });
      continue;
    }
    if (!chunks || chunks.length === 0) {
      await supabase
        .from("source_rq_relevance")
        .update({ passage_extraction_status: "failed", passage_extraction_hint: "keine Chunks mit Embedding gefunden" })
        .eq("source_id", sourceId)
        .eq("research_question_id", rq.id);
      errors.push({ research_question_code: rq.code, message: "keine Chunks mit Embedding gefunden" });
      continue;
    }

    const userPrompt = buildUserPrompt(source, rq, chunks as Chunk[]);
    let candidates: Candidate[];
    let tokensTotal = 0;
    try {
      const claudeResp = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!claudeResp.ok) {
        const text = await claudeResp.text();
        throw new Error(`Claude-Fehler ${claudeResp.status}: ${text}`);
      }
      const claudeData = await claudeResp.json();
      if (claudeData.stop_reason === "refusal") {
        throw new Error("Claude hat die Anfrage abgelehnt (refusal)");
      }
      const responseText = claudeData.content?.[0]?.text ?? "";
      tokensTotal = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0);
      candidates = parseClaudeResponse(responseText);
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc);
      await supabase
        .from("source_rq_relevance")
        .update({ passage_extraction_status: "failed", passage_extraction_hint: `Extraktion fehlgeschlagen: ${message}` })
        .eq("source_id", sourceId)
        .eq("research_question_id", rq.id);
      errors.push({ research_question_code: rq.code, message });
      continue;
    }

    // Nur unbestaetigte Kandidaten eines frueheren Laufs ersetzen - bereits
    // bestaetigte Zitate bleiben unangetastet (gleiches Prinzip wie bei
    // source_topics/source_rq_relevance, Paket 3).
    await supabase.from("passages").delete().eq("source_id", sourceId).eq("research_question_id", rq.id).eq(
      "confirmed",
      false,
    );

    let kept = 0;
    let discarded = 0;
    for (const candidate of candidates) {
      const chunk = findSourceChunk(candidate.original, chunks as Chunk[]);
      if (!chunk) {
        discarded += 1;
        continue;
      }
      const citationPage = chunk.page + (source.page_offset ?? 0);
      const { data: citation, error: citationError } = await supabase.rpc("format_citation", {
        authors: source.authors,
        p_year: source.year,
        p_page: citationPage,
      });
      if (citationError) {
        errors.push({ research_question_code: rq.code, message: citationError.message });
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("passages")
        .insert({
          source_id: sourceId,
          research_question_id: rq.id,
          page: chunk.page,
          original: candidate.original,
          translation: candidate.translation,
          relevance: candidate.relevance,
          citation,
          confirmed: false,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        errors.push({ research_question_code: rq.code, message: insertError?.message ?? "Insert fehlgeschlagen" });
        continue;
      }

      results.push({
        id: inserted.id,
        research_question_id: rq.id,
        research_question_code: rq.code,
        page: chunk.page,
        original: candidate.original,
        translation: candidate.translation,
        citation,
        relevance: candidate.relevance,
      });
      kept += 1;
    }
    discardedTotal += discarded;

    const hint = kept > 0 ? null : `0 von ${candidates.length} Kandidatenpassagen verifiziert`;
    await supabase
      .from("source_rq_relevance")
      .update({ passage_extraction_status: "complete", passage_extraction_hint: hint })
      .eq("source_id", sourceId)
      .eq("research_question_id", rq.id);

    await supabase.from("ai_log_entries").insert({
      action_type: "passagen_extraktion",
      source_id: sourceId,
      description: `${rq.code}: ${kept} Passage(n) erzeugt, ${discarded} verworfen`,
      tokens: tokensTotal,
    });
  }

  return jsonResponse({ results, errors, discarded: discardedTotal }, 200);
});
