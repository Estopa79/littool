import { supabase } from './supabase'
import type { Author } from './sources'

export type PoolPassage = {
  id: string
  page: number
  original: string
  translation: string | null
  paraphrase: string | null
  citation: string
  relevance: number
  source_id: string
  authors: Author[] | null
  year: number | null
  research_question_id: string
  topic_ids: string[]
}

type RawRow = {
  id: string
  page: number
  original: string
  translation: string | null
  paraphrase: string | null
  citation: string
  relevance: number
  research_question_id: string
  sources: {
    id: string
    authors: Author[] | null
    year: number | null
    source_topics: Array<{ confirmed: boolean; topic_id: string }> | null
  } | null
}

// Alle bestaetigten Zitate einmal laden (Bestandsgroesse macht das
// unproblematisch, gleiches Muster wie andernorts) - Filterung auf den
// Abschnitt passiert clientseitig in filterPassagesForSection, da sich der
// Nutzer zwischen Abschnitten bewegt, ohne dass sich der Gesamtpool aendert.
export async function fetchConfirmedPassagesPool(): Promise<PoolPassage[]> {
  const { data, error } = await supabase
    .from('passages')
    .select(
      `id, page, original, translation, paraphrase, citation, relevance, research_question_id,
       sources ( id, authors, year, source_topics ( confirmed, topic_id ) )`,
    )
    .eq('confirmed', true)
  if (error) throw error

  return (data ?? []).map((row) => {
    const r = row as unknown as RawRow
    const topicIds = (r.sources?.source_topics ?? []).filter((t) => t.confirmed).map((t) => t.topic_id)
    return {
      id: r.id,
      page: r.page,
      original: r.original,
      translation: r.translation,
      paraphrase: r.paraphrase,
      citation: r.citation,
      relevance: r.relevance,
      source_id: r.sources?.id ?? '',
      authors: r.sources?.authors ?? null,
      year: r.sources?.year ?? null,
      research_question_id: r.research_question_id,
      topic_ids: topicIds,
    }
  })
}

// "vorgefiltert auf die FFs/Themen des Abschnitts" (Arbeitsplan Paket 4):
// ein Zitat passt, wenn seine Forschungsfrage ODER eines seiner bestaetigten
// Themenfelder mit den Verknuepfungen des Abschnitts uebereinstimmt.
export function filterPassagesForSection(
  passages: PoolPassage[],
  section: { rqIds: Set<string>; topicIds: Set<string> },
): PoolPassage[] {
  return passages.filter(
    (p) => section.rqIds.has(p.research_question_id) || p.topic_ids.some((t) => section.topicIds.has(t)),
  )
}
