import type { Author } from './sources'

export type ApaSource = {
  id: string
  type: string
  title: string
  authors: Author[] | null
  year: number | null
  venue: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  url: string | null
  created_at: string
}

const MISSING_VENUE_JOURNAL = '[Zeitschrift fehlt]'
const MISSING_VENUE_KONFERENZ = '[Tagungsband fehlt]'
const MISSING_VENUE_BUCH = '[Verlag fehlt]'
const MISSING_VENUE_GRAU = '[Herausgeber fehlt]'

function formatInitials(given: string): string {
  return given
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ')
}

function formatSingleAuthor(a: Author): string {
  const family = a.family?.trim() ?? ''
  const given = a.given?.trim()
  if (!given) return family // Institution/Organisation als Autor, keine Initialen
  return `${family}, ${formatInitials(given)}`
}

// APA 7: 1 Autor "Familie, F.", 2-20 Autoren mit Komma vor "&" (auch bei
// genau zweien), ab 21 die ersten 19 + Ellipse + letzter Autor.
export function formatAuthorsApa(authors: Author[] | null): string {
  const list = (authors ?? []).filter((a) => a.family?.trim())
  if (list.length === 0) return '[Autor fehlt]'

  const formatted = list.map(formatSingleAuthor)
  if (formatted.length === 1) return formatted[0]
  if (formatted.length <= 20) {
    return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`
  }
  return `${formatted.slice(0, 19).join(', ')}, … ${formatted[formatted.length - 1]}`
}

function firstAuthorKey(source: ApaSource): string | null {
  const first = (source.authors ?? []).find((a) => a.family?.trim())
  return first ? first.family.trim().toLowerCase() : null
}

export function sortSourcesApa(sources: ApaSource[]): ApaSource[] {
  return [...sources].sort((a, b) => {
    const ak = firstAuthorKey(a) ?? '￿'
    const bk = firstAuthorKey(b) ?? '￿'
    if (ak !== bk) return ak.localeCompare(bk)
    const ay = a.year ?? Number.MAX_SAFE_INTEGER
    const by = b.year ?? Number.MAX_SAFE_INTEGER
    if (ay !== by) return ay - by
    return a.title.localeCompare(b.title)
  })
}

// Sonderfall "mehrere Werke gleicher Autor + Jahr": nur Quellen mit
// bekanntem Erstautor UND bekanntem Jahr werden gruppiert - bei fehlenden
// Angaben waere eine Gruppierung nur geraten, nicht belegt.
export function assignYearSuffixes(sources: ApaSource[]): Map<string, string | null> {
  const groups = new Map<string, ApaSource[]>()
  const result = new Map<string, string | null>()

  for (const source of sources) {
    const authorKey = firstAuthorKey(source)
    if (authorKey === null || source.year === null) {
      result.set(source.id, null)
      continue
    }
    const key = `${authorKey}::${source.year}`
    const group = groups.get(key)
    if (group) group.push(source)
    else groups.set(key, [source])
  }

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.set(group[0].id, null)
      continue
    }
    const sorted = [...group].sort((a, b) => a.title.localeCompare(b.title))
    sorted.forEach((source, i) => result.set(source.id, String.fromCharCode(97 + i)))
  }

  return result
}

function yearLabel(year: number | null, suffix: string | null): string {
  if (year === null) return 'o. J.'
  return suffix ? `${year}${suffix}` : `${year}`
}

function doiSuffix(source: ApaSource): string {
  return source.doi ? ` https://doi.org/${source.doi}` : ''
}

function formatRetrievalDate(createdAt: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(createdAt),
  )
}

export function formatApaEntry(source: ApaSource, yearSuffix: string | null = null): string {
  const authorStr = formatAuthorsApa(source.authors)
  const year = `(${yearLabel(source.year, yearSuffix)})`
  const title = source.title.trim()

  switch (source.type) {
    case 'journal': {
      let locator = source.venue?.trim() || MISSING_VENUE_JOURNAL
      if (source.volume) locator += `, ${source.volume}${source.issue ? `(${source.issue})` : ''}`
      if (source.pages) locator += `, ${source.pages}`
      return `${authorStr} ${year}. ${title}. ${locator}.${doiSuffix(source)}`
    }
    case 'konferenz': {
      const venue = source.venue?.trim() || MISSING_VENUE_KONFERENZ
      const pagesPart = source.pages ? ` (S. ${source.pages})` : ''
      return `${authorStr} ${year}. ${title}. In ${venue}${pagesPart}.${doiSuffix(source)}`
    }
    case 'buch': {
      const venue = source.venue?.trim() || MISSING_VENUE_BUCH
      return `${authorStr} ${year}. ${title}. ${venue}.${doiSuffix(source)}`
    }
    case 'dissertation': {
      const institution = source.venue?.trim()
      return `${authorStr} ${year}. ${title} [Dissertation${institution ? `, ${institution}` : ''}].`
    }
    case 'grau':
    default: {
      const venue = source.venue?.trim()
      let entry = `${authorStr} ${year}. ${title}.`
      if (venue) entry += ` ${venue}.`
      if (source.url) {
        entry += ` Abgerufen am ${formatRetrievalDate(source.created_at)} von ${source.url}`
      } else if (source.doi) {
        entry += doiSuffix(source)
      } else if (!venue) {
        entry += ` ${MISSING_VENUE_GRAU}`
      }
      return entry
    }
  }
}
