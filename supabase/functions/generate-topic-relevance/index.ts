// Nutzer-Feedback beim Review: Themen-/Relevanz-Analyse (bisher Paket-3-Batch
// via CLI) soll nicht mehr automatisch/im Batch laufen, sondern als
// On-Demand-Button auf der Quellen-Detailseite - gleiches Architekturprinzip
// wie generate-citations/paraphrase-passage (Claude-Aufruf serverseitig,
// kein Dauer-Dienst). Prompt/Parsing/Speicherlogik 1:1 portiert aus
// worker/littool_worker/analysis.py (SYSTEM_PROMPT, _build_user_prompt,
// _parse_response, _save_results), damit beide Pfade identisch urteilen.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1500;
const MAX_REPRESENTATIVE_CHUNKS = 8;
const MAX_CHUNK_CHARS = 900;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du unterstützt bei einer Dissertation zum Thema Business-IT Alignment und \
digitale Transformation in der deutschen Sachversicherung. Du ordnest wissenschaftliche \
Quellen thematisch ein und bewertest ihre Relevanz für einzelne Forschungsfragen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung \
davor oder danach und ohne Markdown-Codeblock:

{
  "topics": ["<Themenfeld-Name>", ...],
  "relevance": [
    {"code": "<FF-Kürzel>", "relevance": <0-3>, "reasoning": "<Ein-Satz-Begründung>"},
    ...
  ]
}

Regeln:
- "topics": ausschließlich die Namen in Anführungszeichen aus der Liste "Verfügbare Themenfelder"
  (exakt wie dort notiert, OHNE den Doppelpunkt und OHNE die Beschreibung dahinter),
  mehrere erlaubt, leeres Array falls keins passt.
- "relevance": für JEDES vorgegebene Forschungsfragen-Kürzel genau ein Eintrag, auch bei Relevanz 0.
- relevance: 0 = nicht relevant, 1 = am Rande relevant, 2 = relevant, 3 = zentral relevant.
- reasoning: ein knapper Satz auf Deutsch, der die Einschätzung nachvollziehbar begründet.
`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type Topic = { id: string; name: string; description: string | null };
type Rq = { id: string; code: string; question: string };
type Chunk = { page: number; chunk_index: number; text: string };

function selectRepresentativeChunks(rows: Chunk[]): Chunk[] {
  if (rows.length <= MAX_REPRESENTATIVE_CHUNKS) return rows;
  const step = (rows.length - 1) / (MAX_REPRESENTATIVE_CHUNKS - 1);
  const indices = [...new Set(Array.from({ length: MAX_REPRESENTATIVE_CHUNKS }, (_, i) => Math.round(i * step)))].sort(
    (a, b) => a - b,
  );
  return indices.map((i) => rows[i]);
}

function formatAuthors(authors: Array<{ given?: string; family?: string }> | null): string {
  if (!authors || authors.length === 0) return "unbekannt";
  const names = authors.map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "unbekannt";
}

function buildUserPrompt(
  source: { title: string; authors: unknown; year: number | null; venue: string | null; abstract: string | null },
  topics: Topic[],
  rqs: Rq[],
  chunks: Chunk[],
): string {
  const topicsBlock = topics.map((t) => `- "${t.name}" (Beschreibung: ${t.description ?? "-"})`).join("\n");
  const rqsBlock = rqs.map((rq) => `- ${rq.code}: ${rq.question}`).join("\n");
  const chunksBlock = chunks.map((c) => `[S. ${c.page}] ${c.text.slice(0, MAX_CHUNK_CHARS)}`).join("\n\n");

  return (
    `Verfügbare Themenfelder:\n${topicsBlock}\n\n` +
    `Forschungsfragen:\n${rqsBlock}\n\n` +
    `Quelle:\n` +
    `Titel: ${source.title}\n` +
    `Autoren: ${formatAuthors(source.authors as Array<{ given?: string; family?: string }> | null)}\n` +
    `Jahr: ${source.year ?? "unbekannt"}\n` +
    `Venue: ${source.venue ?? "unbekannt"}\n` +
    `Abstract: ${source.abstract ?? "(kein Abstract vorhanden)"}\n\n` +
    `Textauszüge aus der Quelle:\n${chunksBlock || "(keine Textauszüge vorhanden)"}`
  );
}

type RelevanceEntry = { research_question_id: string; relevance: number; reasoning: string | null };

function parseResponse(
  text: string,
  topicsByName: Map<string, Topic>,
  rqByCode: Map<string, Rq>,
): { topicIds: string[]; relevance: RelevanceEntry[] } {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(cleaned);

  const topicNames: string[] = data.topics ?? [];
  const unknownTopics = topicNames.filter((t) => !topicsByName.has(t));
  if (unknownTopics.length > 0) {
    throw new Error(`unbekannte Themenfelder in Antwort: ${JSON.stringify(unknownTopics)}`);
  }

  const seenCodes = new Set<string>();
  const relevance: RelevanceEntry[] = [];
  for (const entry of data.relevance ?? []) {
    const code = entry.code;
    if (!rqByCode.has(code)) throw new Error(`unbekanntes FF-Kürzel in Antwort: ${code}`);
    const value = entry.relevance;
    if (!Number.isInteger(value) || value < 0 || value > 3) {
      throw new Error(`ungültige Relevanz für ${code}: ${JSON.stringify(value)}`);
    }
    seenCodes.add(code);
    relevance.push({
      research_question_id: rqByCode.get(code)!.id,
      relevance: value,
      reasoning: entry.reasoning ?? null,
    });
  }

  const missing = [...rqByCode.keys()].filter((c) => !seenCodes.has(c));
  if (missing.length > 0) {
    throw new Error(`fehlende Forschungsfragen in Antwort: ${JSON.stringify(missing.sort())}`);
  }

  const topicIds = topicNames.map((name) => topicsByName.get(name)!.id);
  return { topicIds, relevance };
}

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
  if (!sourceId) return jsonResponse({ error: "source_id fehlt" }, 400);

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return jsonResponse({ error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, title, authors, year, venue, abstract")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) {
    return jsonResponse({ error: sourceError?.message ?? "Quelle nicht gefunden" }, 404);
  }

  const [{ data: topics }, { data: rqs }, { data: chunkRows }] = await Promise.all([
    supabase.from("topics").select("id, name, description"),
    supabase.from("research_questions").select("id, code, question").order("sort_order"),
    supabase.from("chunks").select("page, chunk_index, text").eq("source_id", sourceId).order("chunk_index"),
  ]);

  if (!topics || topics.length === 0) {
    return jsonResponse({ error: "Keine Themenfelder angelegt (Einstellungen prüfen)" }, 500);
  }
  if (!rqs || rqs.length === 0) {
    return jsonResponse({ error: "Keine Forschungsfragen angelegt (Einstellungen prüfen)" }, 500);
  }
  if (!chunkRows || chunkRows.length === 0) {
    await supabase
      .from("sources")
      .update({ analysis_status: "failed", analysis_hint: "keine Chunks vorhanden (Volltext fehlt)" })
      .eq("id", sourceId);
    return jsonResponse({ error: "keine Chunks vorhanden - Volltextextraktion fehlgeschlagen?" }, 422);
  }

  const chunks = selectRepresentativeChunks(chunkRows as Chunk[]);
  const topicsByName = new Map((topics as Topic[]).map((t) => [t.name, t]));
  const rqByCode = new Map((rqs as Rq[]).map((rq) => [rq.code, rq]));

  const userPrompt = buildUserPrompt(source, topics as Topic[], rqs as Rq[], chunks);

  let tokensTotal = 0;
  let parsed: { topicIds: string[]; relevance: RelevanceEntry[] };
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
      const errText = await claudeResp.text();
      throw new Error(`Claude-Fehler ${claudeResp.status}: ${errText}`);
    }
    const claudeData = await claudeResp.json();
    if (claudeData.stop_reason === "refusal") {
      throw new Error("Claude hat die Anfrage abgelehnt (refusal)");
    }
    const responseText = claudeData.content?.[0]?.text ?? "";
    tokensTotal = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0);
    parsed = parseResponse(responseText, topicsByName, rqByCode);
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    await supabase
      .from("sources")
      .update({ analysis_status: "failed", analysis_hint: `Analyse fehlgeschlagen: ${message}` })
      .eq("id", sourceId);
    return jsonResponse({ error: message }, 502);
  }

  // Nur unbestaetigte Zuordnungen ersetzen - bereits im QS-Workflow
  // bestaetigte Eintraege bleiben unangetastet (gleiches Prinzip wie in
  // worker/littool_worker/analysis.py::_save_results).
  const { data: confirmedTopicRows } = await supabase
    .from("source_topics")
    .select("topic_id")
    .eq("source_id", sourceId)
    .eq("confirmed", true);
  const confirmedTopicIds = new Set((confirmedTopicRows ?? []).map((r) => r.topic_id));

  await supabase.from("source_topics").delete().eq("source_id", sourceId).eq("confirmed", false);
  const newTopicRows = parsed.topicIds
    .filter((tid) => !confirmedTopicIds.has(tid))
    .map((tid) => ({ source_id: sourceId, topic_id: tid, confirmed: false }));
  if (newTopicRows.length > 0) {
    await supabase.from("source_topics").insert(newTopicRows);
  }

  const { data: confirmedRqRows } = await supabase
    .from("source_rq_relevance")
    .select("research_question_id")
    .eq("source_id", sourceId)
    .eq("confirmed", true);
  const confirmedRqIds = new Set((confirmedRqRows ?? []).map((r) => r.research_question_id));

  await supabase.from("source_rq_relevance").delete().eq("source_id", sourceId).eq("confirmed", false);
  const newRelevanceRows = parsed.relevance
    .filter((e) => !confirmedRqIds.has(e.research_question_id))
    .map((e) => ({
      source_id: sourceId,
      research_question_id: e.research_question_id,
      relevance: e.relevance,
      reasoning: e.reasoning,
      confirmed: false,
    }));
  if (newRelevanceRows.length > 0) {
    await supabase.from("source_rq_relevance").insert(newRelevanceRows);
  }

  const topicNamesAssigned = parsed.topicIds.map((tid) => (topics as Topic[]).find((t) => t.id === tid)?.name ?? "?");
  await supabase
    .from("sources")
    .update({ analysis_status: "complete", analysis_hint: null })
    .eq("id", sourceId);
  await supabase.from("ai_log_entries").insert({
    action_type: "analyse",
    source_id: sourceId,
    description: `${topicNamesAssigned.length} Themenfeld(er) zugeordnet, Relevanz für ${parsed.relevance.length} Forschungsfragen bewertet`,
    tokens: tokensTotal,
  });

  return jsonResponse(
    {
      topics: topicNamesAssigned,
      relevance: parsed.relevance.map((e) => ({
        research_question_id: e.research_question_id,
        research_question_code: [...rqByCode.values()].find((rq) => rq.id === e.research_question_id)?.code,
        relevance: e.relevance,
        reasoning: e.reasoning,
      })),
    },
    200,
  );
});
