// Nutzer-Feedback beim Review: DOI auf der Quellen-Detailseite nachtragen
// sollte automatisch die restlichen Felder nachreichern, wie beim Ingest.
// Portiert aus worker/littool_worker/crossref.py::fetch_crossref_metadata -
// gleiche Feldnamen/Parsing, damit beide Pfade identisch parsen.

const CROSSREF_BASE = "https://api.crossref.org/works";

const TYPE_MAP: Record<string, string> = {
  "journal-article": "journal",
  "proceedings-article": "konferenz",
  book: "buch",
  "book-chapter": "buch",
  monograph: "buch",
  "reference-book": "buch",
};

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

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

type CrossrefAuthor = { family?: string; given?: string; name?: string };
type CrossrefMessage = {
  author?: CrossrefAuthor[];
  title?: string[];
  "container-title"?: string[];
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  ISSN?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  type?: string;
};

function parseMessage(message: CrossrefMessage) {
  const authors = (message.author ?? [])
    .map((a) => {
      if (a.family) return { family: a.family, given: a.given ?? "" };
      if (a.name) return { family: a.name, given: "" };
      return null;
    })
    .filter((a): a is { family: string; given: string } => a !== null);

  const title = message.title?.[0] ? unescapeHtml(message.title[0]) : null;
  const venue = message["container-title"]?.[0] ? unescapeHtml(message["container-title"][0]) : null;

  let year: number | null = null;
  for (const field of ["published-print", "published-online", "published", "issued"] as const) {
    const parts = message[field]?.["date-parts"];
    if (parts && parts[0] && parts[0][0]) {
      year = parts[0][0];
      break;
    }
  }

  const issn = message.ISSN?.[0] ?? null;

  return {
    title,
    authors: authors.length > 0 ? authors : null,
    year,
    venue,
    volume: message.volume ?? null,
    issue: message.issue ?? null,
    pages: message.page ?? null,
    issn,
    type: message.type ? TYPE_MAP[message.type] ?? null : null,
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

  let body: { doi?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const doi = (body.doi ?? "").trim();
  if (!doi) return jsonResponse({ error: "doi fehlt" }, 400);

  const mailto = Deno.env.get("CROSSREF_MAILTO");
  if (!mailto) return jsonResponse({ error: "CROSSREF_MAILTO nicht gesetzt" }, 500);

  const resp = await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`, {
    headers: { "User-Agent": `LitTool/0.1 (mailto:${mailto})` },
  });
  if (!resp.ok) {
    return jsonResponse({ error: `Crossref: keine Daten gefunden (${resp.status})`, data: null }, 200);
  }
  const json = await resp.json();
  const message = json?.message;
  if (!message) {
    return jsonResponse({ error: "Crossref: keine Daten gefunden", data: null }, 200);
  }

  return jsonResponse({ data: parseMessage(message) }, 200);
});
