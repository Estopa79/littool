// Eingeschobenes Paket vor der Evaluationsmatrix: Deskriptionsmatrix-Eintrag
// je Quelle. Gleiches Architekturprinzip wie generate-topic-relevance/
// generate-citations: Claude-Aufruf serverseitig, on-demand per Button.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 800;
const MAX_REPRESENTATIVE_CHUNKS = 8;
const MAX_CHUNK_CHARS = 900;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du erstellst einen Eintrag für eine Deskriptionsmatrix (Literatur-Synthese-\
Tabelle) einer Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung. Basierend auf den Metadaten und Textauszügen einer Quelle füllst du fünf knappe \
Felder aus.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor oder \
danach und ohne Markdown-Codeblock:

{
  "einordnung": "<kurze Einordnung der Quelle>",
  "theoretische_fundierung": "<zugrunde liegende Theorie/Modell, oder null>",
  "stichprobe": "<Art und Groesse der Stichprobe/Datengrundlage, oder null>",
  "analysemethode": "<Auswertungsverfahren, oder null>",
  "erkenntnisse": "<ein bis zwei Saetze wesentliche Erkenntnisse>"
}

Regeln:
- "einordnung": knapp, im Stil "VHB: B (Journal XY)" bzw. "Dissertation (Universitaet XY)" bzw. \
"Wissenschaftlicher Kontext (Konferenz/Verlag XY)" - nutzt Ranking/Typ/Venue aus den Metadaten.
- "theoretische_fundierung", "stichprobe", "analysemethode": null, wenn die Quelle keine eigene \
empirische/theoretische Studie ist (z. B. reine Praxis-/Marktberichte, Gesetzestexte).
- "erkenntnisse": konkret und auf Deutsch, keine allgemeinen Floskeln.
- Alles auf Deutsch, auch wenn die Quelle englischsprachig ist.
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

function formatAuthors(authors: Array<{ given?: string; family?: string }> | null): string {
  if (!authors || authors.length === 0) return "unbekannt";
  const names = authors.map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "unbekannt";
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
    .select("id, title, authors, year, venue, type, ranking_system, ranking_value, abstract")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) {
    return jsonResponse({ error: sourceError?.message ?? "Quelle nicht gefunden" }, 404);
  }

  const { data: chunkRows } = await supabase
    .from("chunks")
    .select("page, chunk_index, text")
    .eq("source_id", sourceId)
    .order("chunk_index");

  const chunks = selectRepresentativeChunks((chunkRows ?? []) as Chunk[]);
  const chunksBlock = chunks.map((c) => `[S. ${c.page}] ${c.text.slice(0, MAX_CHUNK_CHARS)}`).join("\n\n");

  const userPrompt =
    `Quelle:\n` +
    `Titel: ${source.title}\n` +
    `Autoren: ${formatAuthors(source.authors as Array<{ given?: string; family?: string }> | null)}\n` +
    `Jahr: ${source.year ?? "unbekannt"}\n` +
    `Venue: ${source.venue ?? "unbekannt"}\n` +
    `Typ: ${source.type ?? "unbekannt"}\n` +
    `Ranking: ${source.ranking_system ? `${source.ranking_system} ${source.ranking_value ?? ""}` : "kein Ranking"}\n` +
    `Abstract: ${source.abstract ?? "(kein Abstract vorhanden)"}\n\n` +
    `Textauszüge aus der Quelle:\n${chunksBlock || "(keine Textauszüge vorhanden)"}`;

  let tokensTotal = 0;
  let parsed: {
    einordnung: string | null;
    theoretische_fundierung: string | null;
    stichprobe: string | null;
    analysemethode: string | null;
    erkenntnisse: string | null;
  };
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
    parsed = JSON.parse(responseText);
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    return jsonResponse({ error: message }, 502);
  }

  const { error: upsertError } = await supabase.from("descriptive_matrix_entries").upsert({
    source_id: sourceId,
    einordnung: parsed.einordnung,
    theoretische_fundierung: parsed.theoretische_fundierung,
    stichprobe: parsed.stichprobe,
    analysemethode: parsed.analysemethode,
    erkenntnisse: parsed.erkenntnisse,
    confirmed: false,
  });
  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500);
  }

  await supabase.from("ai_log_entries").insert({
    action_type: "analyse",
    source_id: sourceId,
    description: "Deskriptionsmatrix-Eintrag vorgeschlagen",
    tokens: tokensTotal,
  });

  return jsonResponse({ ...parsed }, 200);
});
