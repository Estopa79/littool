import { supabase } from './supabase'
import type { Author } from './sources'

export type BibtexSource = {
  id: string
  type: string | null
  title: string
  authors: Author[] | null
  year: number | null
  venue: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  issn: string | null
  url: string | null
}

const BIBTEX_COLUMNS = 'id, type, title, authors, year, venue, volume, issue, pages, doi, issn, url'

// Gesamter Bestand - gleicher `triage`-Ausschluss wie ueberall sonst
// (lib/sources.ts::fetchSources dokumentiert die Begruendung), hier separat
// abgefragt statt fetchSources() wiederverwendet, da fuer den BibTeX-Export
// zusaetzliche Felder (volume/issue/pages/doi/issn/url) noetig sind, die die
// zentrale Bibliothek-Liste nicht laedt.
export async function fetchAllSourcesForBibtex(): Promise<BibtexSource[]> {
  const { data, error } = await supabase.from('sources').select(BIBTEX_COLUMNS).neq('status', 'triage')
  if (error) throw error
  return (data ?? []) as BibtexSource[]
}

type RawUsedRow = { passages: { sources: BibtexSource | null } | null }

// "nur verwendete Quellen des aktiven Dokuments" - gleiches Join-Muster wie
// lib/literatureList.ts::fetchUsedSources (Phase 4), hier mit den zusaetzlich
// fuer BibTeX benoetigten Feldern.
export async function fetchUsedSourcesForBibtex(documentId: string): Promise<BibtexSource[]> {
  const { data, error } = await supabase
    .from('used_citations')
    .select(`passages ( sources ( ${BIBTEX_COLUMNS} ) )`)
    .eq('document_id', documentId)
  if (error) throw error

  const bySourceId = new Map<string, BibtexSource>()
  for (const row of data as unknown as RawUsedRow[]) {
    const source = row.passages?.sources
    if (source) bySourceId.set(source.id, source)
  }
  return [...bySourceId.values()]
}

const TYPE_TO_ENTRY: Record<string, string> = {
  journal: 'article',
  konferenz: 'inproceedings',
  buch: 'book',
  dissertation: 'phdthesis',
  grau: 'misc',
}

// BibTeX-Sonderzeichen: geschweifte Klammern muessten das Feld sprengen,
// alles andere (Umlaute, Akzente) verarbeiten moderne BibTeX-/Biblatex-
// Werkzeuge inzwischen problemlos direkt als UTF-8.
function escapeBibtex(value: string): string {
  return value.replace(/([{}])/g, '\\$1')
}

function formatAuthorsBibtex(authors: Author[] | null): string {
  const list = (authors ?? []).filter((a) => a.family?.trim())
  if (list.length === 0) return 'Unbekannt'
  return list.map((a) => (a.given?.trim() ? `${a.family}, ${a.given}` : a.family)).join(' and ')
}

// Zitierschluessel "familie2020titelwort" - Kollisionen (gleicher Autor +
// Jahr + erstes Titelwort) werden innerhalb EINES Exports mit a/b/c...
// aufgeloest, damit keine zwei Eintraege denselben Key tragen.
export function buildBibtexKeys(sources: BibtexSource[]): Map<string, string> {
  const counts = new Map<string, number>()
  const keys = new Map<string, string>()
  for (const s of sources) {
    const family = (s.authors ?? []).find((a) => a.family?.trim())?.family ?? 'unbekannt'
    const firstWord = s.title.trim().split(/\s+/)[0] ?? ''
    const base = `${family}${s.year ?? 'o_j'}${firstWord}`
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')
    const n = counts.get(base) ?? 0
    counts.set(base, n + 1)
    keys.set(s.id, n === 0 ? base : `${base}${String.fromCharCode(97 + n)}`)
  }
  return keys
}

function formatBibtexEntry(source: BibtexSource, key: string): string {
  const entryType = TYPE_TO_ENTRY[source.type ?? ''] ?? 'misc'
  const fields: Array<[string, string | null]> = [
    ['author', formatAuthorsBibtex(source.authors)],
    ['title', source.title],
    ['year', source.year?.toString() ?? null],
  ]

  switch (entryType) {
    case 'article':
      fields.push(['journal', source.venue], ['volume', source.volume], ['number', source.issue], ['pages', source.pages])
      break
    case 'inproceedings':
      fields.push(['booktitle', source.venue], ['pages', source.pages])
      break
    case 'book':
      fields.push(['publisher', source.venue])
      break
    case 'phdthesis':
      fields.push(['school', source.venue])
      break
    default:
      if (source.venue) fields.push(['howpublished', source.venue])
      break
  }
  if (source.doi) fields.push(['doi', source.doi])
  if (source.issn) fields.push(['issn', source.issn])
  if (source.url) fields.push(['url', source.url])

  const body = fields
    .filter((f): f is [string, string] => !!f[1])
    .map(([k, v]) => `  ${k} = {${escapeBibtex(v)}}`)
    .join(',\n')

  return `@${entryType}{${key},\n${body}\n}`
}

export function buildBibtexFile(sources: BibtexSource[]): string {
  const keys = buildBibtexKeys(sources)
  return sources.map((s) => formatBibtexEntry(s, keys.get(s.id)!)).join('\n\n')
}

export function downloadBibtex(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/x-bibtex;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
