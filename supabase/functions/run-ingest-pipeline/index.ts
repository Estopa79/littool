// Ad-hoc (Phase 6): Server-seitige Fortsetzung der Ingest-Pipeline per Button
// in der Bibliothek, statt jeden Schritt manuell per littool-worker-CLI
// anzustossen. Nur die Schritte, die KEIN PyMuPDF/OCR brauchen, werden hier
// portiert - extract-doi, extract-fulltext und chunk bleiben lokal (Deno
// kann keine beliebigen Binaries wie ocrmypdf ausfuehren und PyMuPDF ist eine
// native Python-Bibliothek, keine Portierung ohne echtes Risiko fuer die
// Seiten-Genauigkeit der Chunks). Portierte Logik:
// - enrich-metadata  <- worker/littool_worker/enrich.py (gleiches Muster wie
//   supabase/functions/fetch-crossref-metadata und openalex-search)
// - match-ranking    <- worker/littool_worker/ranking.py (CSV-Daten liegen
//   als Kopie in ./rankings/, gleicher Inhalt wie data/rankings/)
// - detect-duplicates <- worker/littool_worker/duplicates.py
// - embed            <- worker/littool_worker/embeddings.py, aber NUR ein
//   Batch (bis 100 Chunks) pro Aufruf - Voyage-Rate-Limit-Pacing (21s
//   zwischen Requests) wuerde bei vielen Chunks das Edge-Function-Timeout
//   reissen. Das Frontend ruft die Funktion wiederholt auf, bis
//   embed_remaining = 0.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { VHB_CSV } from "./vhb_data.ts";
import { SJR_CSV } from "./sjr_data.ts";

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

// ---------- Crossref (Portiert aus worker/littool_worker/crossref.py) ----------

const CROSSREF_BASE = "https://api.crossref.org/works";

const CROSSREF_TYPE_MAP: Record<string, string> = {
  "journal-article": "journal",
  "proceedings-article": "konferenz",
  book: "buch",
  "book-chapter": "buch",
  monograph: "buch",
  "reference-book": "buch",
};

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

type MetadataFields = {
  title?: string | null;
  authors?: Array<{ family: string; given: string }> | null;
  year?: number | null;
  venue?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  issn?: string | null;
  abstract?: string | null;
  citation_count?: number | null;
  type?: string | null;
};

function parseCrossrefMessage(message: CrossrefMessage): MetadataFields {
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

  return {
    title,
    authors: authors.length > 0 ? authors : null,
    year,
    venue,
    volume: message.volume ?? null,
    issue: message.issue ?? null,
    pages: message.page ?? null,
    issn: message.ISSN?.[0] ?? null,
    type: message.type ? CROSSREF_TYPE_MAP[message.type] ?? null : null,
  };
}

async function fetchCrossrefMetadata(doi: string, mailto: string): Promise<MetadataFields | null> {
  const resp = await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`, {
    headers: { "User-Agent": `LitTool/0.1 (mailto:${mailto})` },
  });
  if (!resp.ok) return null;
  const message = (await resp.json())?.message;
  if (!message) return null;
  return parseCrossrefMessage(message);
}

// ---------- OpenAlex (Portiert aus worker/littool_worker/openalex.py) ----------

const OPENALEX_BASE = "https://api.openalex.org/works";

type OpenAlexAuthorship = { author?: { display_name?: string } };
type OpenAlexWork = {
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  authorships?: OpenAlexAuthorship[];
  primary_location?: { source?: { display_name?: string } };
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]>;
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

function parseOpenAlexWork(work: OpenAlexWork): MetadataFields {
  return {
    title: work.title ?? work.display_name ?? null,
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    citation_count: work.cited_by_count ?? null,
  };
}

async function fetchOpenAlexByDoi(doi: string, mailto: string): Promise<MetadataFields | null> {
  const resp = await fetch(`${OPENALEX_BASE}/doi:${encodeURIComponent(doi)}?${new URLSearchParams({ mailto })}`);
  if (!resp.ok) return null;
  return parseOpenAlexWork(await resp.json());
}

async function searchOpenAlexByTitle(
  title: string,
  mailto: string,
): Promise<{ fields: MetadataFields; title: string | null } | null> {
  const url = `${OPENALEX_BASE}?${new URLSearchParams({ search: title, per_page: "1", mailto })}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const results = ((await resp.json()).results ?? []) as OpenAlexWork[];
  if (results.length === 0) return null;
  const work = results[0];
  return { fields: parseOpenAlexWork(work), title: work.title ?? work.display_name ?? null };
}

// Simple Ratcliff/Obershelp-Titel-Aehnlichkeit (wie Python difflib.SequenceMatcher.ratio,
// ohne Junk-Heuristik - fuer Titel-Laenge irrelevant), genutzt sowohl fuer den
// Enrich-Fallback (Schwelle 0.5) als auch fuer Duplikat-Erkennung (Schwelle 0.85).
function longestMatch(
  a: string,
  b: string,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): [number, number, number] {
  let bestI = aStart;
  let bestJ = bStart;
  let bestSize = 0;
  let j2len = new Map<number, number>();
  for (let i = aStart; i < aEnd; i++) {
    const newJ2len = new Map<number, number>();
    for (let j = bStart; j < bEnd; j++) {
      if (a[i] === b[j]) {
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newJ2len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len = newJ2len;
  }
  return [bestI, bestJ, bestSize];
}

function similarityRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  let total = 0;
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  while (queue.length > 0) {
    const [aStart, aEnd, bStart, bEnd] = queue.pop()!;
    const [i, j, k] = longestMatch(a, b, aStart, aEnd, bStart, bEnd);
    if (k > 0) {
      total += k;
      if (aStart < i && bStart < j) queue.push([aStart, i, bStart, j]);
      if (i + k < aEnd && j + k < bEnd) queue.push([i + k, aEnd, j + k, bEnd]);
    }
  }
  return (2 * total) / (a.length + b.length);
}

// ---------- Ranking-CSVs (Portiert aus worker/littool_worker/ranking.py) ----------

function normalizeIssn(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return digits.length === 8 ? digits : null;
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = value.toLowerCase().replace(/&/g, "and");
  s = s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return s || null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = values[idx] ?? "";
    });
    return row;
  });
}

type RankingSource = { system: string; byIssn: Map<string, string>; byName: Map<string, string> };

let rankingSources: RankingSource[] | null = null;

function loadRankingSources(): RankingSource[] {
  if (rankingSources) return rankingSources;

  function load(system: string, csvText: string, ratingField: string): RankingSource {
    const byIssn = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const row of parseCsv(csvText)) {
      const rating = (row["rating"] || row[ratingField] || "").trim();
      if (!rating) continue;
      const issn = normalizeIssn(row["issn"]);
      if (issn && !byIssn.has(issn)) byIssn.set(issn, rating);
      const name = normalizeName(row["title"]);
      if (name && !byName.has(name)) byName.set(name, rating);
    }
    return { system, byIssn, byName };
  }

  rankingSources = [
    load("VHB", VHB_CSV, "rating"),
    load("SJR", SJR_CSV, "sjr_quartile"),
  ];
  return rankingSources;
}

function matchRanking(
  sources: RankingSource[],
  issn: string | null,
  venue: string | null,
): { system: string | null; value: string | null } {
  const nIssn = normalizeIssn(issn);
  const nName = normalizeName(venue);
  for (const source of sources) {
    if (nIssn && source.byIssn.has(nIssn)) return { system: source.system, value: source.byIssn.get(nIssn)! };
    if (nName && source.byName.has(nName)) return { system: source.system, value: source.byName.get(nName)! };
  }
  return { system: null, value: null };
}

// ---------- Hauptablauf ----------

type SourceRow = {
  id: string;
  doi: string | null;
  title: string;
  authors: unknown;
  year: number | null;
  venue: string | null;
  status: string;
  status_hint: string | null;
};

const REQUIRED_FIELDS: Array<keyof MetadataFields> = ["title", "authors", "year", "venue"];
const FIELD_LABELS: Record<string, string> = { title: "Titel", authors: "Autoren", year: "Jahr", venue: "Venue" };

function mergeFields(update: MetadataFields, incoming: MetadataFields | null | undefined): void {
  if (!incoming) return;
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    const k = key as keyof MetadataFields;
    if ((update as Record<string, unknown>)[k] == null) {
      (update as Record<string, unknown>)[k] = value;
    }
  }
}

function isComplete(merged: Record<string, unknown>): boolean {
  return REQUIRED_FIELDS.every((f) => merged[f] != null && merged[f] !== "");
}

function finish(update: MetadataFields, row: SourceRow, stats: { complete: number; needs_review: number }) {
  const merged: Record<string, unknown> = { ...row, ...update };
  const result: MetadataFields & { status: string; status_hint: string | null } = {
    ...update,
    status: "complete",
    status_hint: null,
  };
  if (isComplete(merged)) {
    stats.complete++;
  } else {
    const missing = REQUIRED_FIELDS.filter((f) => merged[f] == null || merged[f] === "").map((f) => FIELD_LABELS[f]);
    result.status = "needs_review";
    result.status_hint = `Metadaten unvollständig: ${missing.join(", ")} fehlt`;
    stats.needs_review++;
  }
  return result;
}

async function runEnrichMetadata(
  supabase: ReturnType<typeof createClient>,
  crossrefMailto: string,
  openalexMailto: string,
) {
  const stats = { complete: 0, needs_review: 0, fehler: 0 };

  const { data: primary } = await supabase
    .from("sources")
    .select("id, doi, title, authors, year, venue, status, status_hint")
    .eq("status", "processing")
    .not("doi", "is", null);

  for (const row of (primary ?? []) as SourceRow[]) {
    try {
      const [crossrefData, openalexData] = await Promise.all([
        fetchCrossrefMetadata(row.doi!, crossrefMailto),
        fetchOpenAlexByDoi(row.doi!, openalexMailto),
      ]);
      const update: MetadataFields = {};
      mergeFields(update, crossrefData);
      mergeFields(update, { abstract: openalexData?.abstract, citation_count: openalexData?.citation_count });
      mergeFields(update, { venue: openalexData?.venue });
      const result = finish(update, row, stats);
      await supabase.from("sources").update(result).eq("id", row.id);
    } catch (exc) {
      await supabase
        .from("sources")
        .update({ status: "failed", status_hint: `Metadaten-Anreicherung fehlgeschlagen: ${exc}` })
        .eq("id", row.id);
      stats.fehler++;
    }
  }

  const { data: fallback } = await supabase
    .from("sources")
    .select("id, doi, title, authors, year, venue, status, status_hint")
    .eq("status", "needs_review")
    .eq("status_hint", "keine DOI gefunden");

  for (const row of (fallback ?? []) as SourceRow[]) {
    try {
      const found = await searchOpenAlexByTitle(row.title, openalexMailto);
      const similarity = found?.title ? similarityRatio(row.title.toLowerCase(), found.title.toLowerCase()) : 0;
      if (!found || similarity < 0.5) {
        await supabase
          .from("sources")
          .update({
            status_hint: found?.title
              ? "keine DOI gefunden, Titelsuche ohne ausreichend sicheren Treffer - manuell prüfen"
              : "keine DOI gefunden, auch keine Metadaten über Titelsuche gefunden",
          })
          .eq("id", row.id);
        continue;
      }
      const update: MetadataFields = {};
      mergeFields(update, found.fields);
      const result = finish(update, row, stats);
      await supabase.from("sources").update(result).eq("id", row.id);
    } catch (exc) {
      await supabase.from("sources").update({ status_hint: `Metadaten-Anreicherung fehlgeschlagen: ${exc}` }).eq(
        "id",
        row.id,
      );
      stats.fehler++;
    }
  }

  return stats;
}

async function runMatchRanking(supabase: ReturnType<typeof createClient>) {
  const stats = { gefunden: 0, kein_treffer: 0 };
  const sources = loadRankingSources();

  const { data: rows } = await supabase
    .from("sources")
    .select("id, issn, venue")
    .is("ranking_system", null)
    .eq("ranking_manual", false)
    .neq("type", "grau");

  for (const row of (rows ?? []) as Array<{ id: string; issn: string | null; venue: string | null }>) {
    const { system, value } = matchRanking(sources, row.issn, row.venue);
    await supabase.from("sources").update({ ranking_system: system, ranking_value: value }).eq("id", row.id);
    if (system) stats.gefunden++;
    else stats.kein_treffer++;
  }

  return stats;
}

async function runDetectDuplicates(supabase: ReturnType<typeof createClient>) {
  const { data: rows } = await supabase.from("sources").select("id, title, created_at").order("created_at");
  const list = (rows ?? []) as Array<{ id: string; title: string; created_at: string }>;
  const flagged = new Set<string>();

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const older = list[i];
      const newer = list[j];
      if (flagged.has(newer.id)) continue;
      const ratio = similarityRatio(
        older.title.trim().toLowerCase().replace(/\s+/g, " "),
        newer.title.trim().toLowerCase().replace(/\s+/g, " "),
      );
      if (ratio < 0.85) continue;
      await supabase
        .from("sources")
        .update({
          status: "needs_review",
          status_hint: `Ähnlicher Titel wie bestehende Quelle "${older.title}" (Ähnlichkeit ${Math.round(ratio * 100)}%) - evtl. Dublette, bitte prüfen`,
        })
        .eq("id", newer.id);
      flagged.add(newer.id);
    }
  }

  return { dubletten_markiert: flagged.size, geprueft: list.length };
}

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3.5";
const OUTPUT_DIMENSION = 1024;
const EMBED_BATCH_SIZE = 100;

function vecLiteral(values: number[]): string {
  return "[" + values.map((v) => v.toFixed(6)).join(",") + "]";
}

async function runEmbedBatch(supabase: ReturnType<typeof createClient>, voyageKey: string) {
  const { data: rows } = await supabase
    .from("chunks")
    .select("id, text")
    .is("embedding", null)
    .limit(EMBED_BATCH_SIZE);
  const batch = (rows ?? []) as Array<{ id: string; text: string }>;

  if (batch.length === 0) {
    return { eingebettet: 0, remaining: 0 };
  }

  const voyageResp = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${voyageKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: batch.map((r) => r.text),
      model: VOYAGE_MODEL,
      input_type: "document",
      output_dimension: OUTPUT_DIMENSION,
    }),
  });
  if (!voyageResp.ok) {
    const text = await voyageResp.text();
    throw new Error(`Voyage-Fehler ${voyageResp.status}: ${text}`);
  }
  const voyageData = await voyageResp.json();
  const embeddings: number[][] = voyageData.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);

  for (let i = 0; i < batch.length; i++) {
    await supabase.from("chunks").update({ embedding: vecLiteral(embeddings[i]) }).eq("id", batch[i].id);
  }

  const { count } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return { eingebettet: batch.length, remaining: count ?? 0 };
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

  const crossrefMailto = Deno.env.get("CROSSREF_MAILTO");
  const openalexMailto = Deno.env.get("OPENALEX_MAILTO");
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  if (!crossrefMailto || !openalexMailto || !voyageKey) {
    return jsonResponse({ error: "CROSSREF_MAILTO, OPENALEX_MAILTO oder VOYAGE_API_KEY nicht gesetzt" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    const enrich = await runEnrichMetadata(supabase, crossrefMailto, openalexMailto);
    const ranking = await runMatchRanking(supabase);
    const duplicates = await runDetectDuplicates(supabase);
    const embed = await runEmbedBatch(supabase, voyageKey);

    return jsonResponse({ enrich, ranking, duplicates, embed }, 200);
  } catch (exc) {
    return jsonResponse({ error: exc instanceof Error ? exc.message : String(exc) }, 500);
  }
});
