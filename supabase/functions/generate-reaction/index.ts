// Phase 5, Paket 6: eine einzelne Persona-Reaktion im Diskussionsfaden zu
// einer konkreten Entwurfsversion. Bewusst SYNCHRON (kein Hintergrund-Job
// wie generate-draft/Paket 5) - CLAUDE.md nennt explizit "Entwurf, Debatte,
// Batch-Ingest" als lange Aktionen, die einen Job brauchen; eine einzelne
// Reaktion ("eine Reaktion pro Klick", Arbeitsplan Paket 6) ist ein einzelner
// kurzer Claude-Aufruf, gleiches Muster wie generate-citations/
// paraphrase-passage.
//
// Keine strukturelle Marker-Pruefung wie bei generate-draft: eine Reaktion
// ist Kritik/Frage/Beobachtung in Fliesstext, keine Zitat-Marker-Syntax.
// Belegpflicht wirkt hier ueber den Persona-Systemprompt (Paket 3) plus die
// Format-Instruktion unten, die die Zitat-Liste als einzige zulaessige
// Quellenbasis vorgibt - keine zweite automatisierte Nachpruefung (die ist
// fuer den generierten Entwurf selbst da, Paket 5), da eine Reaktion primaer
// Meinung/Kritik ist, keine neue inhaltliche Textproduktion.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1200;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REACTION_FORMAT_INSTRUCTIONS = `Du reagierst auf einen Entwurfstext im Rahmen einer laufenden \
Diskussion zwischen dir und dem Autor (und ggf. weiteren Personas). Du bekommst den aktuellen Entwurf, \
eine Liste verfügbarer Zitate (mit Zitation) und den bisherigen Diskussionsverlauf.

Schreibe GENAU EINE Reaktion in deiner Rolle (siehe oben) - eine Frage, ein Kritikpunkt, eine \
Beobachtung oder eine Anmerkung, wie es deiner Haltung entspricht. Wenn du eine inhaltliche/faktische \
Behauptung aufstellst (z. B. "Autor X argumentiert anders"), belege sie mit einer der Zitationen aus \
der Liste unten, in der Form "(Autor, Jahr, S. x)" - erfinde keine Zitation, die nicht in der Liste \
steht. Fragen oder Kritik an der Argumentation/Struktur brauchen keinen Beleg.

Antworte AUSSCHLIESSLICH mit deiner Reaktion als Fliesstext, ohne Einleitung, ohne \
Anführungszeichen, ohne JSON, ohne Markdown-Codeblock.`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type CitationInfo = { citation: string; original: string; translation: string | null };

// deno-lint-ignore no-explicit-any
async function fetchSectionCitations(supabase: any, sectionId: string): Promise<CitationInfo[]> {
  const [{ data: rqLinks }, { data: topicLinks }] = await Promise.all([
    supabase.from("section_research_questions").select("research_question_id").eq("section_id", sectionId),
    supabase.from("section_topics").select("topic_id").eq("section_id", sectionId),
  ]);
  const rqIds = new Set((rqLinks ?? []).map((r: { research_question_id: string }) => r.research_question_id));
  const topicIds = new Set((topicLinks ?? []).map((r: { topic_id: string }) => r.topic_id));

  const { data: passages, error } = await supabase
    .from("passages")
    .select("citation, original, translation, research_question_id, sources(source_topics(confirmed, topic_id))")
    .eq("confirmed", true);
  if (error) throw new Error(error.message);

  // deno-lint-ignore no-explicit-any
  return (passages ?? [])
    .filter((p: any) => {
      const passageTopics = (p.sources?.source_topics ?? [])
        .filter((t: { confirmed: boolean }) => t.confirmed)
        .map((t: { topic_id: string }) => t.topic_id);
      return rqIds.has(p.research_question_id) || passageTopics.some((t: string) => topicIds.has(t));
    })
    // deno-lint-ignore no-explicit-any
    .map((p: any) => ({ citation: p.citation, original: p.original, translation: p.translation }));
}

function buildReactionUserPrompt(
  sectionLabel: string,
  draftText: string,
  citations: CitationInfo[],
  history: Array<{ speaker: string; text: string }>,
): string {
  const citationList = citations.length
    ? citations
        .map((c) => `(${c.citation}): "${c.original}"` + (c.translation ? ` / Übersetzung: "${c.translation}"` : ""))
        .join("\n")
    : "(keine passenden Zitate im Pool)";
  const historyBlock = history.length
    ? history.map((h) => `${h.speaker}: ${h.text}`).join("\n\n")
    : "(noch keine Diskussion)";
  return (
    `Abschnitt: ${sectionLabel}\n\nEntwurf:\n${draftText}\n\nVerfügbare Zitate:\n${citationList}\n\n` +
    `Bisherige Diskussion:\n${historyBlock}\n\nSchreibe jetzt deine Reaktion.`
  );
}

async function callClaude(anthropicKey: string, system: string, user: string): Promise<{ text: string; tokens: number }> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content: user }] }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Claude-Fehler ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  if (data.stop_reason === "refusal") throw new Error("Claude hat die Anfrage abgelehnt (refusal)");
  const text = (data.content?.[0]?.text ?? "").trim();
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { text, tokens };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Nur POST erlaubt" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Fehlende Authorization" }, 401);

  let body: { section_id?: string; draft_id?: string; persona_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const { section_id, draft_id, persona_id } = body;
  if (!section_id || !draft_id || !persona_id) {
    return jsonResponse({ error: "section_id, draft_id und persona_id sind erforderlich" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return jsonResponse({ error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const [{ data: persona, error: personaError }, { data: section, error: sectionError }, { data: draft, error: draftError }] =
    await Promise.all([
      supabase.from("personas").select("id, name, system_prompt, active").eq("id", persona_id).single(),
      supabase.from("sections").select("id, number, title").eq("id", section_id).single(),
      supabase.from("drafts").select("id, section_id, version, text").eq("id", draft_id).single(),
    ]);
  if (personaError || !persona) return jsonResponse({ error: "Persona nicht gefunden" }, 404);
  if (!persona.active) return jsonResponse({ error: "Persona ist deaktiviert" }, 400);
  if (sectionError || !section) return jsonResponse({ error: "Abschnitt nicht gefunden" }, 404);
  if (draftError || !draft) return jsonResponse({ error: "Entwurfsversion nicht gefunden" }, 404);
  if (draft.section_id !== section_id) {
    return jsonResponse({ error: "Entwurfsversion gehört nicht zu diesem Abschnitt" }, 400);
  }

  const { data: historyRaw, error: historyError } = await supabase
    .from("discussion_entries")
    .select("author_type, text, personas(name)")
    .eq("draft_id", draft_id)
    .order("created_at", { ascending: true });
  if (historyError) return jsonResponse({ error: historyError.message }, 500);

  const history = (historyRaw ?? []).map((h: { author_type: string; text: string; personas: { name: string } | null }) => ({
    speaker: h.author_type === "user" ? "Du" : h.personas?.name ?? "Persona",
    text: h.text,
  }));

  let citations: CitationInfo[];
  try {
    citations = await fetchSectionCitations(supabase, section_id);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 500);
  }

  const sectionLabel = section.number ? `${section.number} ${section.title}` : section.title;
  const system = `${persona.system_prompt}\n\n${REACTION_FORMAT_INSTRUCTIONS}`;
  const user = buildReactionUserPrompt(sectionLabel, draft.text, citations, history);

  let reaction: { text: string; tokens: number };
  try {
    reaction = await callClaude(anthropicKey, system, user);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 502);
  }
  if (!reaction.text) return jsonResponse({ error: "Leere Antwort von Claude" }, 502);

  const { data: entry, error: insertError } = await supabase
    .from("discussion_entries")
    .insert({ section_id, draft_id, author_type: "persona", persona_id, text: reaction.text })
    .select("id, section_id, draft_id, author_type, persona_id, text, created_at")
    .single();
  if (insertError || !entry) {
    return jsonResponse({ error: insertError?.message ?? "Reaktion konnte nicht gespeichert werden" }, 500);
  }

  await supabase.from("ai_log_entries").insert({
    action_type: "reaktion",
    description: `Reaktion von ${persona.name} auf Entwurf v${draft.version} für Abschnitt „${sectionLabel}"`,
    tokens: reaction.tokens,
  });

  return jsonResponse({ entry: { ...entry, persona_name: persona.name } }, 200);
});
