// Phase 6, Paket 2: Nachrecherche via OpenAlex - Stichwort-/Themensuche direkt
// gegen die kostenlose OpenAlex-API. Parsing-Logik spiegelt
// worker/littool_worker/openalex.py::_parse_work (gleiche Feldnamen), damit
// beide Pfade identisch interpretieren.

const OPENALEX_BASE = "https://api.openalex.org/works";
const PER_PAGE = 25;

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

type OpenAlexAuthorship = { author?: { display_name?: string } };
type OpenAlexWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  authorships?: OpenAlexAuthorship[];
  primary_location?: { source?: { display_name?: string } };
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]>;
  type?: string;
  best_oa_location?: { pdf_url?: string | null } | null;
};

const TYPE_MAP: Record<string, string> = {
  article: "journal",
  "journal-article": "journal",
  "proceedings-article": "konferenz",
  book: "buch",
  "book-chapter": "buch",
  monograph: "buch",
  dissertation: "dissertation",
};

function reconstructAbstract(invertedIndex: Record<string, number[]> | undefined): string | null {
  if (!invertedIndex) return null;
  const positions = new Map<number, string>();
  for (const [word, idxs] of Object.entries(invertedIndex)) {
    for (const i of idxs) positions.set(i, word);
  }
  if (positions.size === 0) return null;
  return [...positions.keys()].sort((a, b) => a - b).map((i) => positions.get(i)).join(" ");
}

function parseWork(work: OpenAlexWork) {
  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((name): name is string => !!name)
    .map((name) => {
      const parts = name.split(" ");
      if (parts.length >= 2) {
        return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
      }
      return { given: "", family: name };
    });

  return {
    openalex_id: (work.id ?? "").replace("https://openalex.org/", ""),
    doi: work.doi ? work.doi.replace("https://doi.org/", "") : null,
    title: work.title ?? work.display_name ?? "(ohne Titel)",
    authors,
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    citation_count: work.cited_by_count ?? null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    type: work.type ? TYPE_MAP[work.type] ?? "grau" : "grau",
    oa_pdf_url: work.best_oa_location?.pdf_url ?? null,
  };
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

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const query = (body.query ?? "").trim();
  if (!query) return jsonResponse({ error: "query fehlt" }, 400);

  const mailto = Deno.env.get("OPENALEX_MAILTO");
  if (!mailto) return jsonResponse({ error: "OPENALEX_MAILTO nicht gesetzt" }, 500);

  const url = `${OPENALEX_BASE}?${new URLSearchParams({
    search: query,
    per_page: String(PER_PAGE),
    mailto,
  })}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    return jsonResponse({ error: `OpenAlex: Fehler bei der Suche (${resp.status})` }, 502);
  }
  const json = await resp.json();
  const results = ((json.results ?? []) as OpenAlexWork[]).map(parseWork);

  return jsonResponse({ results }, 200);
});
