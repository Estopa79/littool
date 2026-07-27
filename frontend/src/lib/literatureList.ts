import { supabase } from './supabase'
import { formatApaEntry, sortSourcesApa, assignYearSuffixes, type ApaSource } from './apaFormat'

type RawRow = {
  passages: { sources: ApaSource | null } | null
}

// Alle Quellen mit mindestens einem angehakten Zitat im aktiven Dokument,
// dedupliziert (mehrere angehakte Zitate derselben Quelle zaehlen als eine
// Literaturverzeichnis-Zeile).
export async function fetchUsedSources(documentId: string): Promise<ApaSource[]> {
  const { data, error } = await supabase
    .from('used_citations')
    .select(
      `passages (
         sources (
           id, type, title, authors, year, venue, volume, issue, pages, doi, url, created_at
         )
       )`,
    )
    .eq('document_id', documentId)
  if (error) throw error

  const bySourceId = new Map<string, ApaSource>()
  for (const row of data as unknown as RawRow[]) {
    const source = row.passages?.sources
    if (source) bySourceId.set(source.id, source)
  }
  return [...bySourceId.values()]
}

export type LiteratureEntry = { sourceId: string; text: string }

export function buildLiteratureList(sources: ApaSource[]): LiteratureEntry[] {
  const sorted = sortSourcesApa(sources)
  const suffixes = assignYearSuffixes(sorted)
  return sorted.map((source) => ({
    sourceId: source.id,
    text: formatApaEntry(source, suffixes.get(source.id) ?? null),
  }))
}
