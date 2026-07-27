// Evaluationsmatrix (Paket 11, umgebaut): "Kriterien vorschlagen" - Claude
// leitet aus Thema, Forschungsfragen, Themenfeldern und den in der
// Deskriptionsmatrix ausgewaehlten Quellen (samt ihrer dortigen Synthese-
// Felder) ein Kriterien-Set her, jedes mit Beschreibung + Herleitung.
// Vorschlaege werden unbestaetigt in `criteria` gespeichert - der Autor
// prueft/aendert/verwirft sie in der Ansicht wie ueberall sonst.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2000;
const DEFAULT_SET_NAME = "Evaluationskriterien";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du leitest Bewertungskriterien fuer eine Evaluationsmatrix einer Dissertation \
zu Business-IT Alignment und digitale Transformation in der deutschen Sachversicherung her. Du \
bekommst das Dissertationsthema, die Forschungsfragen, die Themenfelder und eine Liste der \
ausgewaehlten Quellen (mit kurzer Synthese je Quelle).

Leite daraus 5 bis 8 Kriterien her, anhand derer sich diese Quellen sinnvoll vergleichen lassen \
(z. B. behandelte Konstrukte, methodischer Zugang, Praxisbezug, regulatorischer Bezug - je nach \
tatsaechlichem Bestand).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor oder \
danach und ohne Markdown-Codeblock:

{
  "criteria": [
    {"beschreibung": "<Kurzbezeichnung des Kriteriums>", "herleitung": "<ein bis zwei Saetze: woraus leitet sich das Kriterium ab>"}
  ]
}
`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
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

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return jsonResponse({ error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const [{ data: settings }, { data: rqs }, { data: topics }, { data: includedEntries }] = await Promise.all([
    supabase.from("app_settings").select("dissertation_theme").maybeSingle(),
    supabase.from("research_questions").select("code, question").order("sort_order"),
    supabase.from("topics").select("name, description"),
    supabase
      .from("descriptive_matrix_entries")
      .select("einordnung, theoretische_fundierung, erkenntnisse, sources(title, authors, year)")
      .eq("included", true),
  ]);

  if (!includedEntries || includedEntries.length === 0) {
    return jsonResponse(
      { error: "Keine Quellen in der Deskriptionsmatrix ausgewählt (Häkchen setzen)" },
      422,
    );
  }

  const rqsBlock = (rqs ?? []).map((rq) => `- ${rq.code}: ${rq.question}`).join("\n");
  const topicsBlock = (topics ?? []).map((t) => `- ${t.name}${t.description ? ` (${t.description})` : ""}`).join("\n");
  const sourcesBlock = includedEntries
    .map((e) => {
      const row = e as unknown as {
        einordnung: string | null;
        theoretische_fundierung: string | null;
        erkenntnisse: string | null;
        sources: { title: string; year: number | null } | null;
      };
      const title = row.sources?.title ?? "?";
      const year = row.sources?.year ?? "o. J.";
      const parts = [row.einordnung, row.theoretische_fundierung, row.erkenntnisse].filter(Boolean);
      return `- ${title} (${year})${parts.length ? `: ${parts.join(" | ")}` : ""}`;
    })
    .join("\n");

  const userPrompt =
    `Dissertationsthema: ${settings?.dissertation_theme ?? "unbekannt"}\n\n` +
    `Forschungsfragen:\n${rqsBlock || "(keine hinterlegt)"}\n\n` +
    `Themenfelder:\n${topicsBlock || "(keine hinterlegt)"}\n\n` +
    `Ausgewählte Quellen (aus der Deskriptionsmatrix):\n${sourcesBlock}`;

  let tokensTotal = 0;
  let criteria: Array<{ beschreibung: string; herleitung: string }>;
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
    criteria = data.criteria ?? [];
    if (!Array.isArray(criteria) || criteria.length === 0) {
      throw new Error("keine Kriterien in der Antwort");
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    return jsonResponse({ error: message }, 502);
  }

  let { data: set } = await supabase.from("criterion_sets").select("id").limit(1).maybeSingle();
  if (!set) {
    const { data: newSet, error: setError } = await supabase
      .from("criterion_sets")
      .insert({ name: DEFAULT_SET_NAME })
      .select("id")
      .single();
    if (setError || !newSet) return jsonResponse({ error: setError?.message ?? "Set konnte nicht angelegt werden" }, 500);
    set = newSet;
  }

  const { data: existing } = await supabase.from("criteria").select("sort_order").eq("set_id", set.id).order("sort_order", { ascending: false }).limit(1);
  let nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const rows = criteria.map((c) => ({
    set_id: set!.id,
    name: c.beschreibung,
    short_name: c.beschreibung.length > 30 ? `${c.beschreibung.slice(0, 27)}...` : c.beschreibung,
    sort_order: nextSortOrder++,
    derivation: c.herleitung,
    confirmed: false,
  }));

  const { data: inserted, error: insertError } = await supabase.from("criteria").insert(rows).select("*");
  if (insertError) return jsonResponse({ error: insertError.message }, 500);

  await supabase.from("ai_log_entries").insert({
    action_type: "analyse",
    source_id: null,
    description: `${rows.length} Evaluationskriterien vorgeschlagen`,
    tokens: tokensTotal,
  });

  return jsonResponse({ criteria: inserted }, 200);
});
