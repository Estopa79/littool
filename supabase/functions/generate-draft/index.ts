// Phase 5, Paket 5: Agenten-Entwurf mit Belegpflicht.
//
// Laeuft als Hintergrund-Job (erste Nutzung der Job-Infrastruktur aus
// Paket 1): Die Function validiert schnell, legt eine `jobs`-Zeile an und
// antwortet sofort mit der Job-ID. Die eigentliche Claude-Arbeit (Entwurf +
// separate Belegpruefung) laeuft danach per `EdgeRuntime.waitUntil` weiter,
// unabhaengig davon, ob der Client (Handy) die Seite verlaesst - CLAUDE.md
// verlangt das explizit fuer lange Aktionen wie diese.
//
// Zwei Claude-Aufrufe pro Anfrage: (1) der eigentliche Entwurf mit Markern
// [n], die auf eine mitgegebene Zitat-Liste zeigen, (2) eine unabhaengige
// Nachpruefung, die jeden Satz gegen die zitierten Original-/Uebersetzungs-
// texte prueft und unbelegte Aussagen benennt statt sie stillschweigend
// durchzuwinken (Prinzip "Belegbarkeit", CLAUDE.md).
//
// Strukturelle Belegpruefung (Marker <-> citations <-> ausgewaehlte Zitate)
// passiert NICHT durch Claude, sondern deterministisch im Code - ein Entwurf
// mit einem Marker auf ein nicht angewaehltes/nicht existierendes Zitat wird
// verworfen (kein Insert), nicht nur markiert.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const DRAFT_MAX_TOKENS = 3000;
const VERIFY_MAX_TOKENS = 1500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FORMAT_INSTRUCTIONS = `Du schreibst einen Entwurf fuer einen Abschnitt einer Dissertation. Du bekommst eine \
nummerierte Liste von Zitaten (Original, Uebersetzung, Zitation) - das ist die EINZIGE Quellenbasis, \
die du verwenden darfst.

Regeln:
- Verwende ausschliesslich die Zitate aus der Liste unten. Erfinde keine weiteren Quellen, Zitate \
oder Zahlen.
- Jede inhaltliche/faktische Aussage im Text muss von einem Marker [n] begleitet werden, der auf ein \
Zitat verweist, das diese konkrete Aussage tatsaechlich stuetzt. Kannst du eine Aussage nicht durch \
ein Zitat aus der Liste stuetzen, lass sie weg oder formuliere sie ausdruecklich als offene Frage \
statt sie als Tatsache zu behaupten.
- Ein Marker referenziert genau eine Zitat-Nummer (z. B. [2]); bei mehreren Belegen fuer dieselbe \
Aussage mehrere Marker hintereinander setzen, z. B. [2][3].
- Schreibe wissenschaftlichen Fliesstext auf Deutsch, keine Aufzaehlungen. Kopiere kein Zitat \
woertlich hinein - paraphrasiere/synthetisiere in eigenen Worten, referenziere aber exakt mit dem \
Marker.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklaerung davor oder \
danach und ohne Markdown-Codeblock:
{
  "text": "<Fliesstext mit Markern wie [1], [2] ...>",
  "citations": [ {"marker": 1, "passage_id": "<uuid aus der Liste>"} ]
}
"citations" muss GENAU die Marker enthalten, die im Text tatsaechlich vorkommen - keine zusaetzlichen, \
keine fehlenden.`;

const VERIFIER_SYSTEM_PROMPT = `Du bist eine strikte, unabhaengige Belegpruefung fuer einen \
wissenschaftlichen Text. Du bekommst einen Fliesstext mit Belegmarkern [n] sowie die vollstaendigen \
Zitate, auf die jeder Marker verweist.

Pruefe Satz fuer Satz: Enthaelt der Satz eine inhaltliche/faktische Aussage ueber den \
Forschungsgegenstand? Falls ja, pruefe: Gibt es in diesem Satz (oder unmittelbar angrenzend) einen \
Marker, UND stuetzt das zugehoerige Zitat diese konkrete Aussage tatsaechlich inhaltlich? Rein \
strukturelle/einleitende Saetze ohne eigene inhaltliche Behauptung (z. B. "Im Folgenden wird X \
betrachtet") sind KEINE Aussagen und muessen nicht markiert sein.

Jede Aussage, die (a) keinen Marker hat, oder (b) einen Marker hat, dessen Zitat die Aussage \
inhaltlich nicht deckt, gilt als unbelegt.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklaerung davor oder \
danach und ohne Markdown-Codeblock:
{"unbelegt": [{"auszug": "<woertlicher, zusammenhaengender Auszug aus dem Text>", "grund": "<kurze Begruendung>"}]}
Leeres Array, wenn alles belegt ist.`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type PassageInput = {
  marker: number;
  passage_id: string;
  citation: string;
  original: string;
  translation: string | null;
  source_title: string;
};

function buildDraftUserPrompt(sectionLabel: string, passages: PassageInput[]): string {
  const list = passages
    .map(
      (p) =>
        `[${p.marker}] passage_id="${p.passage_id}" (${p.citation}) - ${p.source_title}\n"${p.original}"` +
        (p.translation ? `\nÜbersetzung: "${p.translation}"` : ""),
    )
    .join("\n\n");
  return (
    `Abschnitt: ${sectionLabel}\n\nVerfügbare Zitate (die passage_id in "citations" muss EXAKT wie hier ` +
    `angegeben übernommen werden, Zeichen für Zeichen):\n\n${list}\n\nSchreibe jetzt den Entwurf für diesen Abschnitt.`
  );
}

type DraftResponse = { text: string; citations: Array<{ marker: number; passage_id: string }> };

function parseDraftResponse(raw: string): DraftResponse {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(cleaned);
  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new Error("leerer/ungültiger 'text' in Claude-Antwort");
  }
  if (!Array.isArray(data.citations)) {
    throw new Error("'citations' fehlt oder ist kein Array in Claude-Antwort");
  }
  for (const c of data.citations) {
    if (!Number.isInteger(c.marker) || typeof c.passage_id !== "string") {
      throw new Error(`ungültiger citations-Eintrag: ${JSON.stringify(c)}`);
    }
  }
  return { text: data.text, citations: data.citations };
}

function validateMarkers(
  text: string,
  citations: Array<{ marker: number; passage_id: string }>,
  allowedPassageIds: Set<string>,
): { ok: true } | { ok: false; error: string } {
  const usedMarkers = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) usedMarkers.add(Number(m[1]));

  const citationMarkers = new Set(citations.map((c) => c.marker));
  if (citationMarkers.size !== citations.length) {
    return { ok: false, error: "doppelte Marker-Nummer in citations" };
  }

  for (const n of usedMarkers) {
    if (!citationMarkers.has(n)) {
      return { ok: false, error: `Marker [${n}] im Text ohne zugehörigen citations-Eintrag` };
    }
  }
  for (const c of citations) {
    if (!usedMarkers.has(c.marker)) {
      return { ok: false, error: `citations-Eintrag [${c.marker}] kommt im Text nicht vor` };
    }
    if (!allowedPassageIds.has(c.passage_id)) {
      return {
        ok: false,
        error: `Marker [${c.marker}] verweist auf ein nicht angewähltes/nicht existierendes Zitat`,
      };
    }
  }
  return { ok: true };
}

function buildVerifyUserPrompt(text: string, citedPassages: PassageInput[]): string {
  const list = citedPassages
    .map((p) => `[${p.marker}] "${p.original}"` + (p.translation ? ` / Übersetzung: "${p.translation}"` : ""))
    .join("\n");
  return `Entwurfstext:\n\n${text}\n\nZitierte Belege je Marker:\n\n${list}`;
}

type VerifyResponse = { unbelegt: Array<{ auszug: string; grund: string }> };

function parseVerifyResponse(raw: string): VerifyResponse {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(cleaned);
  if (!Array.isArray(data.unbelegt)) {
    throw new Error("'unbelegt' fehlt oder ist kein Array in Claude-Antwort");
  }
  for (const u of data.unbelegt) {
    if (typeof u.auszug !== "string" || typeof u.grund !== "string") {
      throw new Error(`ungültiger unbelegt-Eintrag: ${JSON.stringify(u)}`);
    }
  }
  return { unbelegt: data.unbelegt };
}

async function callClaude(
  anthropicKey: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ text: string; tokens: number }> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Claude-Fehler ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  if (data.stop_reason === "refusal") {
    throw new Error("Claude hat die Anfrage abgelehnt (refusal)");
  }
  const text = data.content?.[0]?.text ?? "";
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { text, tokens };
}

// deno-lint-ignore no-explicit-any
async function processJob(
  supabase: any,
  jobId: string,
  sectionId: string,
  personaId: string,
  passageIds: string[],
  version: number,
  anthropicKey: string,
): Promise<void> {
  try {
    await supabase.from("jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq(
      "id",
      jobId,
    );

    const [{ data: persona, error: personaError }, { data: section, error: sectionError }, {
      data: passagesRaw,
      error: passagesError,
    }] = await Promise.all([
      supabase.from("personas").select("id, name, system_prompt").eq("id", personaId).single(),
      supabase.from("sections").select("id, number, title").eq("id", sectionId).single(),
      supabase.from("passages").select("id, citation, original, translation, sources(title)").in(
        "id",
        passageIds,
      ),
    ]);
    if (personaError || !persona) throw new Error(personaError?.message ?? "Persona nicht gefunden");
    if (sectionError || !section) throw new Error(sectionError?.message ?? "Abschnitt nicht gefunden");
    if (passagesError) throw new Error(passagesError.message);
    if (!passagesRaw || passagesRaw.length !== passageIds.length) {
      throw new Error("Nicht alle ausgewählten Zitate gefunden (evtl. zwischenzeitlich geändert)");
    }

    const passageList: PassageInput[] = passageIds.map((id, i) => {
      // deno-lint-ignore no-explicit-any
      const row = (passagesRaw as any[]).find((p) => p.id === id)!;
      return {
        marker: i + 1,
        passage_id: id,
        citation: row.citation,
        original: row.original,
        translation: row.translation,
        source_title: row.sources?.title ?? "?",
      };
    });

    const sectionLabel = section.number ? `${section.number} ${section.title}` : section.title;
    const draftSystem = `${persona.system_prompt}\n\n${FORMAT_INSTRUCTIONS}`;
    const draftUser = buildDraftUserPrompt(sectionLabel, passageList);

    const draftResp = await callClaude(anthropicKey, draftSystem, draftUser, DRAFT_MAX_TOKENS);
    const parsed = parseDraftResponse(draftResp.text);

    const allowedIds = new Set(passageIds);
    const validation = validateMarkers(parsed.text, parsed.citations, allowedIds);
    if (!validation.ok) {
      throw new Error(`Belegprüfung (Struktur) fehlgeschlagen: ${validation.error}`);
    }

    await supabase.from("jobs").update({ progress: 60, updated_at: new Date().toISOString() }).eq(
      "id",
      jobId,
    );

    const citedPassages: PassageInput[] = parsed.citations.map((c) => {
      const base = passageList.find((p) => p.passage_id === c.passage_id)!;
      return { ...base, marker: c.marker };
    });

    const verifyUser = buildVerifyUserPrompt(parsed.text, citedPassages);
    const verifyResp = await callClaude(anthropicKey, VERIFIER_SYSTEM_PROMPT, verifyUser, VERIFY_MAX_TOKENS);
    const verifyParsed = parseVerifyResponse(verifyResp.text);

    const { data: draft, error: draftInsertError } = await supabase
      .from("drafts")
      .insert({
        section_id: sectionId,
        version,
        text: parsed.text,
        created_by: "persona",
        persona_id: personaId,
        job_id: jobId,
        unverified_claims: verifyParsed.unbelegt,
      })
      .select("id")
      .single();
    if (draftInsertError || !draft) {
      throw new Error(draftInsertError?.message ?? "Entwurf konnte nicht gespeichert werden");
    }

    const draftPassageRows = parsed.citations.map((c) => ({
      draft_id: draft.id,
      passage_id: c.passage_id,
      marker: c.marker,
    }));
    const { error: dpError } = await supabase.from("draft_passages").insert(draftPassageRows);
    if (dpError) throw new Error(dpError.message);

    const totalTokens = draftResp.tokens + verifyResp.tokens;
    await supabase.from("ai_log_entries").insert({
      action_type: "entwurf",
      description: `Entwurf v${version} für Abschnitt „${sectionLabel}" (Persona: ${persona.name}), ` +
        `${parsed.citations.length} Zitat(e) referenziert` +
        (verifyParsed.unbelegt.length > 0 ? `, ${verifyParsed.unbelegt.length} unbelegte Aussage(n) markiert` : ""),
      tokens: totalTokens,
    });

    await supabase.from("jobs").update({
      status: "done",
      progress: 100,
      result: { draft_id: draft.id, unverified_count: verifyParsed.unbelegt.length },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
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

  let body: { section_id?: string; persona_id?: string; passage_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const { section_id, persona_id, passage_ids } = body;
  if (!section_id || !persona_id || !Array.isArray(passage_ids) || passage_ids.length === 0) {
    return jsonResponse(
      { error: "section_id, persona_id und mindestens ein passage_id sind erforderlich" },
      400,
    );
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

  const { data: section, error: sectionError } = await supabase.from("sections").select("id").eq(
    "id",
    section_id,
  ).single();
  if (sectionError || !section) return jsonResponse({ error: "Abschnitt nicht gefunden" }, 404);

  const { data: persona, error: personaError } = await supabase.from("personas").select("id, active").eq(
    "id",
    persona_id,
  ).single();
  if (personaError || !persona) return jsonResponse({ error: "Persona nicht gefunden" }, 404);
  if (!persona.active) return jsonResponse({ error: "Persona ist deaktiviert" }, 400);

  const { data: passages, error: passagesError } = await supabase
    .from("passages")
    .select("id, confirmed")
    .in("id", passage_ids);
  if (passagesError) return jsonResponse({ error: passagesError.message }, 500);
  if (!passages || passages.length !== passage_ids.length) {
    return jsonResponse({ error: "Nicht alle ausgewählten Zitate gefunden" }, 400);
  }
  if (passages.some((p: { confirmed: boolean }) => !p.confirmed)) {
    return jsonResponse({ error: "Nur bestätigte Zitate können für einen Entwurf verwendet werden" }, 400);
  }

  const { data: existingVersions, error: versionError } = await supabase
    .from("drafts")
    .select("version")
    .eq("section_id", section_id)
    .order("version", { ascending: false })
    .limit(1);
  if (versionError) return jsonResponse({ error: versionError.message }, 500);
  const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      type: "draft_generation",
      status: "pending",
      payload: { section_id, persona_id, passage_ids, version: nextVersion },
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return jsonResponse({ error: jobError?.message ?? "Job konnte nicht angelegt werden" }, 500);
  }

  // @ts-ignore -- EdgeRuntime ist eine Deno-Deploy-Globale ohne Typdeklaration im jsr-Paket
  EdgeRuntime.waitUntil(
    processJob(supabase, job.id, section_id, persona_id, passage_ids, nextVersion, anthropicKey),
  );

  return jsonResponse({ job_id: job.id }, 200);
});
