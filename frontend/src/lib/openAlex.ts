import { supabase } from './supabase'
import { fetchTriageRejections, titleSimilarity, TITLE_SIMILARITY_THRESHOLD, type TriageRejection } from './triage'
import type { Author } from './sources'

export type OpenAlexResult = {
  openalex_id: string
  doi: string | null
  title: string
  authors: Author[]
  year: number | null
  venue: string | null
  citation_count: number | null
  abstract: string | null
  type: string
  oa_pdf_url: string | null
}

export async function searchOpenAlex(query: string): Promise<OpenAlexResult[]> {
  const { data, error } = await supabase.functions.invoke('openalex-search', { body: { query } })
  if (error) throw error
  return (data?.results ?? []) as OpenAlexResult[]
}

export type OpenAlexCrossRef = {
  alreadyInBestand: boolean
  rejection: TriageRejection | null
}

type ExistingSourceRow = { id: string; doi: string | null; title: string }

// Bewusst OHNE den zentralen `.neq('status','triage')`-Filter aus
// lib/sources.ts::fetchSources - hier soll der Abgleich ausdruecklich AUCH
// bereits im Eingang wartende Kandidaten treffen (sonst koennte man denselben
// Treffer mehrfach in den Eingang importieren), nur intern fuer den Vergleich
// genutzt, nie als Liste angezeigt.
async function fetchAllDoisAndTitles(): Promise<ExistingSourceRow[]> {
  const { data, error } = await supabase.from('sources').select('id, doi, title')
  if (error) throw error
  return (data ?? []) as ExistingSourceRow[]
}

// "bereits vorhandene Treffer werden markiert (,im Bestand'), verworfene
// ebenfalls (,bereits verworfen am ...', aus Paket E)" - Abgleich per DOI
// (exakt, hier anders als beim PDF-Direkt-Upload schon VOR der Uebernahme
// bekannt) mit Titel-Aehnlichkeit als Fallback, gleiche Heuristik wie
// lib/triage.ts::checkAgainstRejections.
export async function crossReferenceOpenAlexResults(
  results: OpenAlexResult[],
): Promise<Map<string, OpenAlexCrossRef>> {
  const [existing, rejections] = await Promise.all([fetchAllDoisAndTitles(), fetchTriageRejections()])
  const map = new Map<string, OpenAlexCrossRef>()

  for (const r of results) {
    const inBestand = existing.some(
      (s) =>
        (r.doi && s.doi && s.doi.toLowerCase() === r.doi.toLowerCase()) ||
        titleSimilarity(s.title, r.title) >= TITLE_SIMILARITY_THRESHOLD,
    )
    const rejection =
      rejections.find(
        (rej) =>
          (r.doi && rej.doi && rej.doi.toLowerCase() === r.doi.toLowerCase()) ||
          titleSimilarity(rej.title, r.title) >= TITLE_SIMILARITY_THRESHOLD,
      ) ?? null

    map.set(r.openalex_id, { alreadyInBestand: inBestand, rejection })
  }
  return map
}

export type OpenAlexImportResult = { sourceId: string; hasPdf: boolean; pdfError: string | null }

export async function importOpenAlexResult(result: OpenAlexResult): Promise<OpenAlexImportResult> {
  const { data, error } = await supabase.functions.invoke('openalex-import', { body: { result } })
  if (error) throw error
  return data as OpenAlexImportResult
}
