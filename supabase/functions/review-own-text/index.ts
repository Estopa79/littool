// Phase 5, Paket 6: "Eigenen Text prüfen" - der Autor reicht selbst
// geschriebenen (nicht KI-generierten) Text zu einem Abschnitt ein. Legt
// diesen Text als neue Entwurfsversion an (created_by='author', s.
// Migration 0032/0034 - Versionierung gilt fuer Autoren- UND
// Agenten-Entwuerfe gleichermassen) und laesst die gewaehlte Persona ihn
// direkt danach im Diskussionsfaden dieser Version beurteilen: passt er zum
// Abschnitt, ist er durch Pool-Zitate gedeckt, was fehlt/ist abwegig.
//
// Bewusst SYNCHRON (kein Hintergrund-Job) - ein einzelner kurzer
// Claude-Aufruf, gleiches Muster wie generate-reaction. Keine Marker-Syntax/
// -Pruefung wie bei generate-draft: der Autorentext enthaelt keine [n]-
// Marker, die Pruefung erfolgt als Fliesstext mit Zitations-Verweisen.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REVIEW_FORMAT_INSTRUCTIONS = `Der Autor hat eigenen Text zu diesem Abschnitt eingereicht (nicht \
KI-generiert) und möchte eine Rückmeldung dazu, bevor er ihn weiterverwendet. Prüfe:

1. Passt der Text inhaltlich zum Abschnitt (Thema/Fokus)?
2. Ist jede inhaltliche/faktische Aussage im Text durch mindestens eines der unten aufgeführten Zitate \
gedeckt? Nenne für gedeckte Aussagen explizit die passende Zitation in der Form "(Autor, Jahr, S. x)". \
Nenne für ungedeckte Aussagen ausdrücklich, dass dafür kein Beleg in der Zitatliste vorliegt - \
erfinde NIEMALS eine Zitation, die nicht in der Liste unten steht.
3. Was fehlt oder wirkt inhaltlich abwegig/unbelegt?

Schreibe deine Rückmeldung als zusammenhängenden Fliesstext in deiner Rolle (siehe oben), mit \
konkreten Zitat-Verweisen wo zutreffend.

Antworte AUSSCHLIESSLICH mit deiner Rückmeldung als Fliesstext, ohne Einleitung, ohne \
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

function buildReviewUserPrompt(sectionLabel: string, authorText: string, citations: CitationInfo[]): string {
  const citationList = citations.length
    ? citations
        .map((c) => `(${c.citation}): "${c.original}"` + (c.translation ? ` / Übersetzung: "${c.translation}"` : ""))
        .join("\n")
    : "(keine passenden Zitate im Pool)";
  return (
    `Abschnitt: ${sectionLabel}\n\nText des Autors:\n${authorText}\n\nVerfügbare Zitate:\n${citationList}\n\n` +
    `Prüfe jetzt diesen Text.`
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

  let body: { section_id?: string; text?: string; persona_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const { section_id, text, persona_id } = body;
  if (!section_id || !text?.trim() || !persona_id) {
    return jsonResponse({ error: "section_id, text und persona_id sind erforderlich" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return jsonResponse({ error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const [{ data: persona, error: personaError }, { data: section, error: sectionError }] = await Promise.all([
    supabase.from("personas").select("id, name, system_prompt, active").eq("id", persona_id).single(),
    supabase.from("sections").select("id, number, title").eq("id", section_id).single(),
  ]);
  if (personaError || !persona) return jsonResponse({ error: "Persona nicht gefunden" }, 404);
  if (!persona.active) return jsonResponse({ error: "Persona ist deaktiviert" }, 400);
  if (sectionError || !section) return jsonResponse({ error: "Abschnitt nicht gefunden" }, 404);

  let citations: CitationInfo[];
  try {
    citations = await fetchSectionCitations(supabase, section_id);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 500);
  }

  const { data: existingVersions, error: versionError } = await supabase
    .from("drafts")
    .select("version")
    .eq("section_id", section_id)
    .order("version", { ascending: false })
    .limit(1);
  if (versionError) return jsonResponse({ error: versionError.message }, 500);
  const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;

  const { data: draft, error: draftInsertError } = await supabase
    .from("drafts")
    .insert({ section_id, version: nextVersion, text, created_by: "author" })
    .select("id, section_id, version, text, created_by, persona_id, status, unverified_claims, created_at")
    .single();
  if (draftInsertError || !draft) {
    return jsonResponse({ error: draftInsertError?.message ?? "Entwurfsversion konnte nicht gespeichert werden" }, 500);
  }

  const sectionLabel = section.number ? `${section.number} ${section.title}` : section.title;
  const system = `${persona.system_prompt}\n\n${REVIEW_FORMAT_INSTRUCTIONS}`;
  const user = buildReviewUserPrompt(sectionLabel, text, citations);

  let review: { text: string; tokens: number };
  try {
    review = await callClaude(anthropicKey, system, user);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 502);
  }
  if (!review.text) return jsonResponse({ error: "Leere Antwort von Claude" }, 502);

  const { data: entry, error: entryInsertError } = await supabase
    .from("discussion_entries")
    .insert({ section_id, draft_id: draft.id, author_type: "persona", persona_id, text: review.text })
    .select("id, section_id, draft_id, author_type, persona_id, text, created_at")
    .single();
  if (entryInsertError || !entry) {
    return jsonResponse({ error: entryInsertError?.message ?? "Rückmeldung konnte nicht gespeichert werden" }, 500);
  }

  await supabase.from("ai_log_entries").insert({
    action_type: "textpruefung",
    description: `Eigener Text geprüft durch ${persona.name} für Abschnitt „${sectionLabel}" (neue Version v${nextVersion})`,
    tokens: review.tokens,
  });

  return jsonResponse({ draft, entry: { ...entry, persona_name: persona.name } }, 200);
});
