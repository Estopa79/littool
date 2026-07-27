// Evaluationsmatrix (Paket 11, umgebaut): KI-Einschaetzung einer Quelle
// gegen alle aktuell vorhandenen Kriterien auf einmal - on-demand per
// Button (Zeile in der Matrix), gleiches Pull-Modell-Prinzip wie
// generate-topic-relevance/generate-descriptive-entry. 4-stufiges Mass:
// 0=nicht, 1=viertel, 2=halb, 3=voll abgedeckt.

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

const SYSTEM_PROMPT = `Du bewertest eine wissenschaftliche Quelle für die Evaluationsmatrix einer \
Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung. Du bekommst eine Liste von Kriterien (mit Herleitung) und Textauszüge aus der \
Quelle.

Bewerte JEDES Kriterium mit einem Wert:
- 0 = nicht abgedeckt (die Quelle liefert dazu nichts)
- 1 = zu einem Viertel abgedeckt (nur am Rande erwähnt)
- 2 = zur Hälfte abgedeckt (teilweise, aber nicht vertieft behandelt)
- 3 = voll abgedeckt (die Quelle behandelt das Kriterium substanziell)

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor oder \
danach und ohne Markdown-Codeblock:

{
  "evaluations": [
    {"criterion_id": "<ID exakt wie vorgegeben>", "value": <0-3>, "reasoning": "<Ein-Satz-Begründung>"}
  ]
}

Regeln:
- Für JEDES vorgegebene Kriterium (per ID) genau ein Eintrag, auch bei Wert 0.
- reasoning: ein knapper Satz auf Deutsch.
`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type Chunk = { page: number; chunk_index: number; text: string };

function selectRepresentativeChunks(rows: Chunk[]): Chunk[] {
  if (rows.length <= MAX_REPRESENTATIVE_CHUNKS) return rows;
  const step = (rows.length - 1) / (MAX_REPRESENTATIVE_CHUNKS - 1);
  const indices = [...new Set(Array.from({ length: MAX_REPRESENTATIVE_CHUNKS }, (_, i) => Math.round(i * step)))].sort(
    (a, b) => a - b,
  );
  return indices.map((i) => rows[i]);
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
    .select("id, title, year, abstract")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) {
    return jsonResponse({ error: sourceError?.message ?? "Quelle nicht gefunden" }, 404);
  }

  const { data: criteria } = await supabase.from("criteria").select("id, name, derivation").order("sort_order");
  if (!criteria || criteria.length === 0) {
    return jsonResponse({ error: "Keine Kriterien angelegt" }, 422);
  }

  const { data: chunkRows } = await supabase
    .from("chunks")
    .select("page, chunk_index, text")
    .eq("source_id", sourceId)
    .order("chunk_index");
  const chunks = selectRepresentativeChunks((chunkRows ?? []) as Chunk[]);
  if (chunks.length === 0) {
    return jsonResponse({ error: "keine Chunks vorhanden - Volltextextraktion fehlgeschlagen?" }, 422);
  }

  const criteriaBlock = criteria.map((c) => `- ID "${c.id}": ${c.name}${c.derivation ? ` (Herleitung: ${c.derivation})` : ""}`).join("\n");
  const chunksBlock = chunks.map((c) => `[S. ${c.page}] ${c.text.slice(0, MAX_CHUNK_CHARS)}`).join("\n\n");
  const userPrompt =
    `Kriterien:\n${criteriaBlock}\n\n` +
    `Quelle: ${source.title} (${source.year ?? "o. J."})\n` +
    `Abstract: ${source.abstract ?? "(kein Abstract vorhanden)"}\n\n` +
    `Textauszüge aus der Quelle:\n${chunksBlock}`;

  let tokensTotal = 0;
  let evaluations: Array<{ criterion_id: string; value: number; reasoning: string | null }>;
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
    let responseText = claudeData.content?.[0]?.text ?? "";
    tokensTotal = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0);
    responseText = responseText.trim();
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
    }
    const data = JSON.parse(responseText);
    const validIds = new Set(criteria.map((c) => c.id));
    evaluations = (data.evaluations ?? []).map((e: { criterion_id: string; value: number; reasoning?: string }) => {
      if (!validIds.has(e.criterion_id)) throw new Error(`unbekannte Kriterium-ID in Antwort: ${e.criterion_id}`);
      if (!Number.isInteger(e.value) || e.value < 0 || e.value > 3) {
        throw new Error(`ungültiger Wert für ${e.criterion_id}: ${JSON.stringify(e.value)}`);
      }
      return { criterion_id: e.criterion_id, value: e.value, reasoning: e.reasoning ?? null };
    });
    const missing = criteria.filter((c) => !evaluations.some((e) => e.criterion_id === c.id));
    if (missing.length > 0) {
      throw new Error(`fehlende Kriterien in Antwort: ${missing.map((c) => c.name).join(", ")}`);
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    return jsonResponse({ error: message }, 502);
  }

  // Nur unbestaetigte Zellen ersetzen - bereits bestaetigte bleiben unangetastet.
  const { data: confirmedRows } = await supabase
    .from("source_criteria")
    .select("criterion_id")
    .eq("source_id", sourceId)
    .eq("confirmed", true);
  const confirmedIds = new Set((confirmedRows ?? []).map((r) => r.criterion_id));

  await supabase.from("source_criteria").delete().eq("source_id", sourceId).eq("confirmed", false);
  const newRows = evaluations
    .filter((e) => !confirmedIds.has(e.criterion_id))
    .map((e) => ({
      source_id: sourceId,
      criterion_id: e.criterion_id,
      value: e.value,
      reasoning: e.reasoning,
      confirmed: false,
    }));
  if (newRows.length > 0) {
    await supabase.from("source_criteria").insert(newRows);
  }

  await supabase.from("ai_log_entries").insert({
    action_type: "analyse",
    source_id: sourceId,
    description: `${evaluations.length} Kriterien bewertet`,
    tokens: tokensTotal,
  });

  return jsonResponse({ evaluations }, 200);
});
