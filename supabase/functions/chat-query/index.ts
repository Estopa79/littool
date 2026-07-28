// Phase 5, Paket 9: Freier, belegter Chat über den Bestand.
//
// RAG über die bestehende Hybrid-Suche aus Phase 2 (search_hybrid, gleiche
// RPC wie die "search"-Function) statt einer neuen Retrieval-Logik. Themen-/
// Studientyp-/Einzelquellen-Filter, die search_hybrid selbst nicht kennt
// (nur ranking_system/type), werden danach serverseitig nachgefiltert -
// bewusst KEINE Änderung an search_hybrid/der bestehenden Suche-Ansicht,
// die die RPC ebenfalls nutzt.
//
// Bewusst SYNCHRON (kein Hintergrund-Job): ein einzelner Chat-Zug ist ein
// kurzer Claude-Aufruf wie generate-reaction/review-own-text, keine lange
// Aktion im Sinne von CLAUDE.md ("Entwurf, Debatte, Batch-Ingest").
//
// Belegpflicht: Claude bekommt eine nummerierte Liste tatsächlicher
// Bestands-Ausschnitte (mit fertiger Zitation) als EINZIGE Wissensquelle und
// muss zurückmelden, welche Nummern es fuer die Antwort tatsächlich benutzt
// hat ("used_indices") - daraus baut der Code (nicht Claude) die fuer
// "Stelle als Zitat-Kandidat übernehmen" noetigen Beleg-Metadaten
// (source_id/page/chunk_id/Original), kein Vertrauen in von Claude selbst
// behauptete Zitationsstrings.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // CLAUDE.md-Vorgabe, nicht verhandelbar
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1500;

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3.5";
const OUTPUT_DIMENSION = 1024;

const RETRIEVE_CANDIDATES = 40;
const MAX_CONTEXT_ITEMS = 8;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SYSTEM_PROMPT = `Du beantwortest Fachfragen zum Literaturbestand einer Dissertation zu \
Business-IT Alignment und digitaler Transformation in der deutschen Sachversicherung. Du bist sachlich \
und praezise, ohne eigene Meinung - deine Aufgabe ist es, den Bestand fuer den Autor zusammenzufassen.`;

const CHAT_FORMAT_INSTRUCTIONS = `Du bekommst eine nummerierte Liste von Ausschnitten aus dem \
Literaturbestand (mit Zitation) - das ist deine EINZIGE Wissensquelle fuer diese Antwort, auch wenn du \
das Thema aus deinem Training kennst. Antworte NUR basierend auf diesen Ausschnitten.

Regeln:
- Jede inhaltliche/faktische Aussage muss von einer Zitation in der Form "(Autor, Jahr, S. x)" begleitet \
werden, exakt wie in der Liste angegeben - erfinde keine Zitation, die nicht in der Liste steht.
- Wenn die Ausschnitte (Teile) der Frage nicht beantworten, sag ausdruecklich "Dazu habe ich keine \
Quelle im Bestand" statt zu spekulieren oder dein Vorwissen zu nutzen.
- Beruecksichtige den bisherigen Gespraechsverlauf fuer den Kontext der Frage, aber jede NEUE inhaltliche \
Aussage in deiner Antwort braucht trotzdem einen Beleg aus der aktuellen Ausschnittsliste.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklaerung davor oder \
danach und ohne Markdown-Codeblock:
{"answer": "<Antworttext mit Zitationen>", "used_indices": [<Zahlen der tatsaechlich verwendeten Ausschnitte>]}`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type SearchHit = {
  chunk_id: string;
  source_id: string;
  authors: unknown;
  year: number | null;
  page: number;
};

type ContextItem = {
  index: number;
  source_id: string;
  chunk_id: string;
  page: number;
  citation: string;
  text: string;
};

type ChatMessage = { role: "user" | "assistant"; text: string; sources?: unknown[] };

function buildContextBlock(items: ContextItem[]): string {
  return items.map((it) => `[${it.index}] (${it.citation})\n"${it.text}"`).join("\n\n");
}

function buildHistoryBlock(history: ChatMessage[]): string {
  if (history.length === 0) return "(neue Unterhaltung)";
  return history.map((m) => `${m.role === "user" ? "Nutzer" : "Assistent"}: ${m.text}`).join("\n\n");
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

function parseClaudeAnswer(raw: string): { answer: string; used_indices: number[] } {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(cleaned);
  if (typeof data.answer !== "string" || !data.answer.trim()) {
    throw new Error("leere/ungültige 'answer' in Claude-Antwort");
  }
  if (!Array.isArray(data.used_indices)) {
    throw new Error("'used_indices' fehlt oder ist kein Array in Claude-Antwort");
  }
  return { answer: data.answer, used_indices: data.used_indices };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Nur POST erlaubt" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Fehlende Authorization" }, 401);

  let body: {
    session_id?: string | null;
    message?: string;
    persona_id?: string | null;
    filter_topic_id?: string | null;
    filter_ranking_system?: string | null;
    filter_study_type?: string | null;
    filter_source_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const message = (body.message ?? "").trim();
  if (!message) return jsonResponse({ error: "message fehlt" }, 400);

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

  let persona: { id: string; name: string; system_prompt: string } | null = null;
  if (body.persona_id) {
    const { data, error } = await supabase
      .from("personas")
      .select("id, name, system_prompt, active")
      .eq("id", body.persona_id)
      .single();
    if (error || !data) return jsonResponse({ error: "Persona nicht gefunden" }, 404);
    if (!data.active) return jsonResponse({ error: "Persona ist deaktiviert" }, 400);
    persona = data;
  }

  let history: ChatMessage[] = [];
  let sessionFilters: Record<string, unknown> = {
    topic_id: body.filter_topic_id ?? null,
    ranking_system: body.filter_ranking_system ?? null,
    study_type: body.filter_study_type ?? null,
    source_id: body.filter_source_id ?? null,
  };
  if (body.session_id) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("messages, filters")
      .eq("id", body.session_id)
      .single();
    if (error || !data) return jsonResponse({ error: "Chat-Sitzung nicht gefunden" }, 404);
    history = (data.messages ?? []) as ChatMessage[];
  }

  // --- Retrieval: search_hybrid (Phase 2) + serverseitige Nachfilterung ---
  const voyageResp = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${voyageKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: [message],
      model: VOYAGE_MODEL,
      input_type: "query",
      output_dimension: OUTPUT_DIMENSION,
    }),
  });
  if (!voyageResp.ok) {
    const t = await voyageResp.text();
    return jsonResponse({ error: `Voyage-Fehler ${voyageResp.status}: ${t}` }, 502);
  }
  const voyageData = await voyageResp.json();
  const queryEmbedding: number[] = voyageData.data[0].embedding;

  const { data: hitsRaw, error: searchError } = await supabase.rpc("search_hybrid", {
    search_query: message,
    query_embedding: queryEmbedding,
    filter_ranking_system: body.filter_ranking_system ?? null,
    filter_type: null,
    match_limit: RETRIEVE_CANDIDATES,
    search_mode: "hybrid",
  });
  if (searchError) return jsonResponse({ error: searchError.message }, 500);

  let hits = (hitsRaw ?? []) as SearchHit[];

  if (body.filter_source_id) {
    hits = hits.filter((h) => h.source_id === body.filter_source_id);
  }
  if (body.filter_topic_id || body.filter_study_type) {
    const sourceIds = Array.from(new Set(hits.map((h) => h.source_id)));
    const allowedSourceIds = new Set<string>();
    if (sourceIds.length > 0) {
      const [{ data: topicRows }, { data: profileRows }] = await Promise.all([
        body.filter_topic_id
          ? supabase.from("source_topics").select("source_id").eq("topic_id", body.filter_topic_id).eq(
            "confirmed",
            true,
          ).in("source_id", sourceIds)
          : Promise.resolve({ data: null }),
        body.filter_study_type
          ? supabase.from("method_profiles").select("source_id").eq("study_type", body.filter_study_type).eq(
            "confirmed",
            true,
          ).in("source_id", sourceIds)
          : Promise.resolve({ data: null }),
      ]);
      const topicOk = body.filter_topic_id ? new Set((topicRows ?? []).map((r: { source_id: string }) => r.source_id)) : null;
      const profileOk = body.filter_study_type
        ? new Set((profileRows ?? []).map((r: { source_id: string }) => r.source_id))
        : null;
      for (const id of sourceIds) {
        const passTopic = !topicOk || topicOk.has(id);
        const passProfile = !profileOk || profileOk.has(id);
        if (passTopic && passProfile) allowedSourceIds.add(id);
      }
    }
    hits = hits.filter((h) => allowedSourceIds.has(h.source_id));
  }

  hits = hits.slice(0, MAX_CONTEXT_ITEMS);

  if (hits.length === 0) {
    const answer = "Dazu habe ich keine Quelle im Bestand (keine passenden Treffer für diese Frage/Filterkombination).";
    const userMsg: ChatMessage = { role: "user", text: message };
    const assistantMsg: ChatMessage = { role: "assistant", text: answer, sources: [] };
    const newMessages = [...history, userMsg, assistantMsg];

    let sessionId = body.session_id ?? null;
    if (sessionId) {
      await supabase.from("chat_sessions").update({
        messages: newMessages,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
    } else {
      const { data: created, error: createError } = await supabase
        .from("chat_sessions")
        .insert({
          persona_id: body.persona_id ?? null,
          title: message.slice(0, 60),
          filters: sessionFilters,
          messages: newMessages,
        })
        .select("id")
        .single();
      if (createError || !created) return jsonResponse({ error: createError?.message ?? "Sitzung konnte nicht angelegt werden" }, 500);
      sessionId = created.id;
    }
    return jsonResponse({ session_id: sessionId, message: assistantMsg }, 200);
  }

  // Chunk-Volltext (nicht nur den ggf. gekuerzten/hervorgehobenen Snippet aus
  // search_hybrid) + page_offset der Quelle fuer die Zitations-Berechnung.
  const chunkIds = hits.map((h) => h.chunk_id);
  const sourceIds = Array.from(new Set(hits.map((h) => h.source_id)));
  const [{ data: chunkRows, error: chunkError }, { data: sourceRows, error: sourceError }] = await Promise.all([
    supabase.from("chunks").select("id, text").in("id", chunkIds),
    supabase.from("sources").select("id, page_offset").in("id", sourceIds),
  ]);
  if (chunkError) return jsonResponse({ error: chunkError.message }, 500);
  if (sourceError) return jsonResponse({ error: sourceError.message }, 500);
  const chunkTextById = new Map((chunkRows ?? []).map((c: { id: string; text: string }) => [c.id, c.text]));
  const pageOffsetBySource = new Map(
    (sourceRows ?? []).map((s: { id: string; page_offset: number | null }) => [s.id, s.page_offset ?? 0]),
  );

  const contextItems: ContextItem[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const citationPage = h.page + (pageOffsetBySource.get(h.source_id) ?? 0);
    const { data: citation, error: citationError } = await supabase.rpc("format_citation", {
      authors: h.authors,
      p_year: h.year,
      p_page: citationPage,
    });
    if (citationError) return jsonResponse({ error: citationError.message }, 500);
    contextItems.push({
      index: i + 1,
      source_id: h.source_id,
      chunk_id: h.chunk_id,
      page: h.page,
      citation: citation as string,
      text: chunkTextById.get(h.chunk_id) ?? "",
    });
  }

  const system = `${persona?.system_prompt ?? DEFAULT_SYSTEM_PROMPT}\n\n${CHAT_FORMAT_INSTRUCTIONS}`;
  const user =
    `Bisheriger Gesprächsverlauf:\n${buildHistoryBlock(history)}\n\nVerfügbare Ausschnitte:\n\n` +
    `${buildContextBlock(contextItems)}\n\nNeue Frage: ${message}\n\nAntworte jetzt.`;

  let result: { text: string; tokens: number };
  try {
    result = await callClaude(anthropicKey, system, user);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 502);
  }

  let parsed: { answer: string; used_indices: number[] };
  try {
    parsed = parseClaudeAnswer(result.text);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 502);
  }

  const usedItems = contextItems.filter((it) => parsed.used_indices.includes(it.index));
  const sources = usedItems.map((it) => ({
    source_id: it.source_id,
    chunk_id: it.chunk_id,
    page: it.page,
    citation: it.citation,
    original: it.text,
  }));

  const userMsg: ChatMessage = { role: "user", text: message };
  const assistantMsg: ChatMessage = { role: "assistant", text: parsed.answer, sources };
  const newMessages = [...history, userMsg, assistantMsg];

  let sessionId = body.session_id ?? null;
  if (sessionId) {
    const { error } = await supabase
      .from("chat_sessions")
      .update({ messages: newMessages, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) return jsonResponse({ error: error.message }, 500);
  } else {
    const { data: created, error } = await supabase
      .from("chat_sessions")
      .insert({
        persona_id: body.persona_id ?? null,
        title: message.slice(0, 60),
        filters: sessionFilters,
        messages: newMessages,
      })
      .select("id")
      .single();
    if (error || !created) return jsonResponse({ error: error?.message ?? "Sitzung konnte nicht angelegt werden" }, 500);
    sessionId = created.id;
  }

  await supabase.from("ai_log_entries").insert({
    action_type: "chat",
    description: `Chat-Anfrage über den Bestand${persona ? ` (Persona: ${persona.name})` : ""}: „${message.slice(0, 80)}"`,
    tokens: result.tokens,
  });

  return jsonResponse({ session_id: sessionId, message: assistantMsg }, 200);
});
