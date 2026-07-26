// Phase 3, Paket 9: Paraphrase-Funktion.
//
// Gleiches Architekturprinzip wie generate-citations (Paket 4): der
// Claude-Aufruf laeuft serverseitig innerhalb des Button-Klicks, kein
// Dauer-Dienst noetig, der Anthropic-Key bleibt aus dem Browser-Bundle
// heraus. Die Paraphrase wird NICHT direkt gespeichert - der Button liefert
// nur einen Vorschlag zurueck, das Frontend uebernimmt/verwirft ihn.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du paraphrasierst einen Textauszug aus einer wissenschaftlichen Quelle fuer \
eine Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung.

Gib die Paraphrase auf Deutsch als sinngemaesse, eigenstaendig formulierte Wiedergabe des \
Originaltexts wieder - keine wörtliche Übersetzung, sondern eigene Formulierung mit demselben \
Aussagegehalt. Erfinde keine zusaetzlichen Fakten oder Wertungen, die nicht im Original stehen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor \
oder danach und ohne Markdown-Codeblock:

{"paraphrase": "<Paraphrase auf Deutsch>"}
`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function parseParaphraseResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(cleaned);
  if (typeof data.paraphrase !== "string" || !data.paraphrase.trim()) {
    throw new Error(`leere/ungültige Paraphrase in Antwort: ${JSON.stringify(data)}`);
  }
  return data.paraphrase;
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

  let body: { text?: string; source_id?: string; passage_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) return jsonResponse({ error: "text fehlt" }, 400);
  if (!body.source_id && !body.passage_id) {
    return jsonResponse({ error: "source_id oder passage_id erforderlich (fuer den AiLog-Eintrag)" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let paraphrase: string;
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
        messages: [{ role: "user", content: `Originaltext:\n${text}` }],
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
    paraphrase = parseParaphraseResponse(responseText);
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    return jsonResponse({ error: message }, 502);
  }

  await supabase.from("ai_log_entries").insert({
    action_type: "paraphrase",
    source_id: body.source_id ?? null,
    passage_id: body.passage_id ?? null,
    description: "Paraphrase erzeugt",
    tokens: tokensTotal,
  });

  return jsonResponse({ paraphrase }, 200);
});
