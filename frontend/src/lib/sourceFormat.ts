import type { Author } from './sources'
import type { SourceStatus } from './sources'

type AuthorYearFields = { authors: Author[] | null; year: number | null }
type RankingFields = { type: string | null; ranking_system: string | null; ranking_value: string | null }

export function formatAuthorYear(source: AuthorYearFields): string {
  const year = source.year ? String(source.year) : '–'
  if (!source.authors || source.authors.length === 0) return year
  const first = source.authors[0].family || source.authors[0].given || '?'
  const suffix = source.authors.length > 1 ? ' et al.' : ''
  return `${first}${suffix} ${year}`
}

export function formatRanking(source: RankingFields): string {
  if (source.type === 'grau') return 'nicht anwendbar'
  if (!source.ranking_system || !source.ranking_value) return 'kein Ranking'
  return `${source.ranking_system} ${source.ranking_value}`
}

export const STATUS_LABEL: Record<SourceStatus, string> = {
  processing: 'in Verarbeitung',
  needs_review: 'prüfen',
  complete: 'vollständig',
  failed: 'fehlgeschlagen',
}

export const STATUS_ICON: Record<SourceStatus, string> = {
  processing: '⏳',
  needs_review: '⚠️',
  complete: '✔️',
  failed: '❌',
}

export const TYPE_LABEL: Record<string, string> = {
  journal: 'Journal',
  konferenz: 'Konferenz',
  buch: 'Buch',
  grau: 'Graue Literatur',
  dissertation: 'Doktorarbeit/wissenschaftliche Arbeit',
}
