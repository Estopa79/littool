// Phase 2, Paket 8: Vermittler zwischen Frontend und Suche.
//
// Der Voyage-Key darf nie ins Browser-Bundle - deshalb läuft die
// Query-Embedding-Berechnung hier (Edge Function, serverseitig) statt im
// Frontend. Reicht die Anfrage danach mit dem Auth-Header des aufrufenden
// Nutzers an die search_hybrid-RPC (Migration 0012) weiter, damit die
// bestehenden RLS-Grants ("to authenticated") greifen statt den Service-Role-
// Key zu benutzen.

import { createClient } from "jsr:@supabase/supabase-js@2";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3.5";
const OUTPUT_DIMENSION = 1024; // Entscheidung aus Phase 2, Paket 1

type SearchMode = "hybrid" | "fulltext" | "semantic";

type SearchRequestBody = {
  query?: string;
  mode?: SearchMode;
  filter_ranking_system?: string | null;
  filter_type?: string | null;
  match_limit?: number;
};

// Frontend (littool.vercel.app) ruft diese Function per Browser-Fetch aus
// einer anderen Origin auf - ohne CORS-Header lehnt der Browser schon den
// Preflight (OPTIONS) ab, bevor die eigentliche Anfrage überhaupt rausgeht.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  let body: SearchRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const query = (body.query ?? "").trim();
  const mode: SearchMode = body.mode ?? "hybrid";
  if (!query) {
    return jsonResponse({ error: "query fehlt" }, 400);
  }

  let queryEmbedding: number[] | null = null;
  if (mode === "hybrid" || mode === "semantic") {
    const voyageKey = Deno.env.get("VOYAGE_API_KEY");
    if (!voyageKey) {
      return jsonResponse({ error: "VOYAGE_API_KEY nicht gesetzt" }, 500);
    }

    const voyageResp = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [query],
        model: VOYAGE_MODEL,
        input_type: "query", // asymmetrisch zu "document" beim Ingest
        output_dimension: OUTPUT_DIMENSION,
      }),
    });

    if (!voyageResp.ok) {
      const text = await voyageResp.text();
      return jsonResponse({ error: `Voyage-Fehler ${voyageResp.status}: ${text}` }, 502);
    }

    const voyageData = await voyageResp.json();
    queryEmbedding = voyageData.data[0].embedding;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await supabase.rpc("search_hybrid", {
    search_query: query,
    query_embedding: queryEmbedding,
    filter_ranking_system: body.filter_ranking_system ?? null,
    filter_type: body.filter_type ?? null,
    match_limit: body.match_limit ?? 20,
    search_mode: mode,
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ results: data }, 200);
});
