// Phase 5, Paket 7: Mehr-Runden-Debatte zwischen 2-3 Personas ueber den
// aktuellen Entwurf. Laeuft als Hintergrund-Job (zweite Nutzung der
// Job-Infrastruktur aus Paket 1, nach generate-draft/Paket 5) - CLAUDE.md
// nennt "Debatte" explizit als lange Aktion, die weiterlaufen muss, wenn der
// Client (Handy) die Seite verlaesst.
//
// Jede Runde laesst jede gewaehlte Persona einmal zu Wort kommen (in der
// gegebenen Reihenfolge), als ganz normale discussion_entries-Zeile - die
// Debatte erscheint dadurch im selben Diskussionsfaden wie einzelne
// Reaktionen/Kommentare (Paket 6), nur eben mehrere Beitraege autonom
// hintereinander statt einer pro Klick. Vor jeder neuen Runde wird der
// Job-Status neu geladen: steht er zwischenzeitlich auf 'cancelled' (vom
// Frontend gesetzt), bricht die Debatte kontrolliert ab, statt weitere
// Runden zu erzwingen ("jederzeit abbrechbar").
//
// Abschluss: ein neutraler, personenunabhaengiger Claude-Aufruf fasst die
// Kernpunkte zusammen und wird als eigener discussion_entries-Eintrag mit
// author_type='system' gespeichert (Migration 0036) - "als letzter Eintrag"
// laut Arbeitsplan, auch wenn die Debatte abgebrochen wurde.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const TURN_MAX_TOKENS = 800;
const SUMMARY_MAX_TOKENS = 600;
const MIN_PERSONAS = 2;
const MAX_PERSONAS = 3;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 5;
const DEFAULT_ROUNDS = 3;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEBATE_TURN_INSTRUCTIONS = `Du nimmst an einer moderierten Mehr-Runden-Debatte mit anderen Personas \
über den aktuellen Entwurf teil. Du bekommst den Entwurf, eine Liste verfügbarer Zitate und den \
bisherigen Debattenverlauf (inkl. Beiträgen der anderen Personas).

Schreibe GENAU EINEN Beitrag in deiner Rolle - reagiere wo passend auf das, was die anderen Personas \
gerade gesagt haben (stimme zu, widersprich, ergänze), bringe aber auch eigene neue Punkte ein, die zu \
deiner Rolle passen. Wenn du eine inhaltliche/faktische Behauptung aufstellst, belege sie mit einer \
Zitation aus der Liste in der Form "(Autor, Jahr, S. x)" - erfinde keine Zitation, die nicht in der \
Liste steht.

Antworte AUSSCHLIESSLICH mit deinem Beitrag als Fliesstext, ohne Einleitung, ohne \
Anführungszeichen, ohne JSON, ohne Markdown-Codeblock.`;

const SUMMARY_SYSTEM_PROMPT = `Du bist ein neutraler Protokollant. Du bekommst den Verlauf einer \
Mehr-Runden-Debatte mehrerer Personas über einen Dissertations-Abschnitt. Fasse die Kernpunkte in 3-6 \
Sätzen zusammen: Worüber waren sich die Personas einig? Worüber uneinig? Was sollte der Autor als \
nächstes konkret tun? Schreibe neutral, ohne selbst Partei zu ergreifen.

Antworte AUSSCHLIESSLICH mit der Zusammenfassung als Fliesstext, ohne Einleitung wie "Zusammenfassung:", \
ohne JSON, ohne Markdown-Codeblock.`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type CitationInfo = { citation: string; original: string; translation: string | null };
type Turn = { speaker: string; text: string };

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

function formatHistory(history: Turn[]): string {
  return history.length ? history.map((h) => `${h.speaker}: ${h.text}`).join("\n\n") : "(noch keine Beiträge)";
}

function buildTurnUserPrompt(
  sectionLabel: string,
  draftText: string,
  citations: CitationInfo[],
  history: Turn[],
  round: number,
  roundLimit: number,
): string {
  const citationList = citations.length
    ? citations
        .map((c) => `(${c.citation}): "${c.original}"` + (c.translation ? ` / Übersetzung: "${c.translation}"` : ""))
        .join("\n")
    : "(keine passenden Zitate im Pool)";
  return (
    `Abschnitt: ${sectionLabel}\n\nEntwurf:\n${draftText}\n\nVerfügbare Zitate:\n${citationList}\n\n` +
    `Runde ${round} von ${roundLimit}.\n\nBisheriger Debattenverlauf:\n${formatHistory(history)}\n\n` +
    `Schreibe jetzt deinen Beitrag (Runde ${round}).`
  );
}

function buildSummaryUserPrompt(history: Turn[]): string {
  return `Debattenverlauf:\n\n${formatHistory(history)}\n\nFasse jetzt die Kernpunkte zusammen.`;
}

async function callClaude(anthropicKey: string, system: string, user: string, maxTokens: number): Promise<{ text: string; tokens: number }> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
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

type PersonaInfo = { id: string; name: string; system_prompt: string };

// deno-lint-ignore no-explicit-any
async function isCancelled(supabase: any, jobId: string): Promise<boolean> {
  const { data } = await supabase.from("jobs").select("status").eq("id", jobId).single();
  return data?.status === "cancelled";
}

async function runDebate(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  jobId: string,
  sectionId: string,
  draftId: string,
  personas: PersonaInfo[],
  roundLimit: number,
  anthropicKey: string,
): Promise<void> {
  let totalTokens = 0;
  let cancelled = false;
  try {
    await supabase.from("jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId);

    const { data: section, error: sectionError } = await supabase
      .from("sections")
      .select("id, number, title")
      .eq("id", sectionId)
      .single();
    if (sectionError || !section) throw new Error(sectionError?.message ?? "Abschnitt nicht gefunden");

    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id, text")
      .eq("id", draftId)
      .single();
    if (draftError || !draft) throw new Error(draftError?.message ?? "Entwurfsversion nicht gefunden");

    const { data: priorRaw } = await supabase
      .from("discussion_entries")
      .select("author_type, text, personas(name)")
      .eq("draft_id", draftId)
      .order("created_at", { ascending: true });
    const priorHistory: Turn[] = (priorRaw ?? []).map(
      (h: { author_type: string; text: string; personas: { name: string } | null }) => ({
        speaker: h.author_type === "user" ? "Du" : h.author_type === "system" ? "Zusammenfassung" : h.personas?.name ?? "Persona",
        text: h.text,
      }),
    );

    const citations = await fetchSectionCitations(supabase, sectionId);
    const sectionLabel = section.number ? `${section.number} ${section.title}` : section.title;

    const debateHistory: Turn[] = [];
    const totalTurns = roundLimit * personas.length;
    let turnsDone = 0;

    roundLoop: for (let round = 1; round <= roundLimit; round++) {
      if (await isCancelled(supabase, jobId)) {
        cancelled = true;
        break roundLoop;
      }
      for (const persona of personas) {
        const system = `${persona.system_prompt}\n\n${DEBATE_TURN_INSTRUCTIONS}`;
        const user = buildTurnUserPrompt(
          sectionLabel,
          draft.text,
          citations,
          [...priorHistory, ...debateHistory],
          round,
          roundLimit,
        );
        const turn = await callClaude(anthropicKey, system, user, TURN_MAX_TOKENS);
        totalTokens += turn.tokens;
        if (turn.text) {
          await supabase.from("discussion_entries").insert({
            section_id: sectionId,
            draft_id: draftId,
            author_type: "persona",
            persona_id: persona.id,
            text: turn.text,
          });
          debateHistory.push({ speaker: persona.name, text: turn.text });
        }
        turnsDone++;
        await supabase
          .from("jobs")
          .update({ progress: Math.round((turnsDone / totalTurns) * 90), updated_at: new Date().toISOString() })
          .eq("id", jobId);
      }
    }

    if (debateHistory.length > 0) {
      const summary = await callClaude(anthropicKey, SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt(debateHistory), SUMMARY_MAX_TOKENS);
      totalTokens += summary.tokens;
      if (summary.text) {
        await supabase.from("discussion_entries").insert({
          section_id: sectionId,
          draft_id: draftId,
          author_type: "system",
          text: summary.text,
        });
      }
    }

    await supabase.from("ai_log_entries").insert({
      action_type: "debatte",
      description:
        `Debatte über Entwurf für Abschnitt „${sectionLabel}" mit ${personas.map((p) => p.name).join(", ")} ` +
        `(${cancelled ? "abgebrochen nach" : ""} ${Math.floor(turnsDone / personas.length)} von ${roundLimit} Runden${cancelled ? "" : " abgeschlossen"})`,
      tokens: totalTokens,
    });

    await supabase
      .from("jobs")
      .update({
        status: cancelled ? "cancelled" : "done",
        progress: 100,
        result: { rounds_completed: Math.floor(turnsDone / personas.length), turns: turnsDone },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    await supabase.from("jobs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq(
      "id",
      jobId,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Nur POST erlaubt" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Fehlende Authorization" }, 401);

  let body: { section_id?: string; draft_id?: string; persona_ids?: string[]; round_limit?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const { section_id, draft_id, persona_ids } = body;
  const roundLimit = body.round_limit ?? DEFAULT_ROUNDS;

  if (!section_id || !draft_id || !Array.isArray(persona_ids)) {
    return jsonResponse({ error: "section_id, draft_id und persona_ids sind erforderlich" }, 400);
  }
  if (persona_ids.length < MIN_PERSONAS || persona_ids.length > MAX_PERSONAS) {
    return jsonResponse({ error: `Bitte ${MIN_PERSONAS}-${MAX_PERSONAS} Personas auswählen` }, 400);
  }
  if (new Set(persona_ids).size !== persona_ids.length) {
    return jsonResponse({ error: "Personas müssen unterschiedlich sein" }, 400);
  }
  if (!Number.isInteger(roundLimit) || roundLimit < MIN_ROUNDS || roundLimit > MAX_ROUNDS) {
    return jsonResponse({ error: `Rundenlimit muss zwischen ${MIN_ROUNDS} und ${MAX_ROUNDS} liegen` }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return jsonResponse({ error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, section_id")
    .eq("id", draft_id)
    .single();
  if (draftError || !draft) return jsonResponse({ error: "Entwurfsversion nicht gefunden" }, 404);
  if (draft.section_id !== section_id) {
    return jsonResponse({ error: "Entwurfsversion gehört nicht zu diesem Abschnitt" }, 400);
  }

  const { data: personaRows, error: personaError } = await supabase
    .from("personas")
    .select("id, name, system_prompt, active")
    .in("id", persona_ids);
  if (personaError) return jsonResponse({ error: personaError.message }, 500);
  if (!personaRows || personaRows.length !== persona_ids.length) {
    return jsonResponse({ error: "Nicht alle ausgewählten Personas gefunden" }, 404);
  }
  if (personaRows.some((p: { active: boolean }) => !p.active)) {
    return jsonResponse({ error: "Mindestens eine ausgewählte Persona ist deaktiviert" }, 400);
  }
  // Reihenfolge aus persona_ids beibehalten (Sprechreihenfolge je Runde), nicht die DB-Rueckgabereihenfolge.
  const personas: PersonaInfo[] = persona_ids.map(
    (id) => personaRows.find((p: { id: string }) => p.id === id)!,
  );

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      type: "debate",
      status: "pending",
      payload: { section_id, draft_id, persona_ids, round_limit: roundLimit },
    })
    .select("id")
    .single();
  if (jobError || !job) return jsonResponse({ error: jobError?.message ?? "Job konnte nicht angelegt werden" }, 500);

  // Weiterlaeuft im Hintergrund, auch wenn der Client die Verbindung schliesst.
  // @ts-ignore -- EdgeRuntime ist eine Deno-Deploy-Globale ohne Typdeklaration im jsr-Paket
  EdgeRuntime.waitUntil(runDebate(supabase, job.id, section_id, draft_id, personas, roundLimit, anthropicKey));

  return jsonResponse({ job_id: job.id }, 200);
});
