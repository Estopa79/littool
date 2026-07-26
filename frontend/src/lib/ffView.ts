import { supabase } from './supabase'
import type { Author } from './sources'
import { STUDY_TYPE_LABEL, type StudyType } from './methodProfiles'

export type RqWithCount = { id: string; code: string; question: string; count: number }

export async function fetchRqWithCounts(): Promise<RqWithCount[]> {
  const [{ data: rqs, error: rqError }, { data: passages, error: passageError }] = await Promise.all([
    supabase.from('research_questions').select('id, code, question').order('sort_order'),
    supabase.from('passages').select('research_question_id').eq('confirmed', true),
  ])
  if (rqError) throw rqError
  if (passageError) throw passageError

  const counts = new Map<string, number>()
  for (const p of passages ?? []) {
    counts.set(p.research_question_id, (counts.get(p.research_question_id) ?? 0) + 1)
  }
  return (rqs ?? []).map((rq) => ({ ...rq, count: counts.get(rq.id) ?? 0 }))
}

export type FfPassage = {
  id: string
  page: number
  original: string
  translation: string | null
  paraphrase: string | null
  citation: string
  relevance: number
  source_id: string
  source_title: string
  authors: Author[] | null
  year: number | null
  ranking_system: string | null
  ranking_value: string | null
  topics: string[]
  study_type: StudyType | null
  function_name: string | null
}

type RawSourceJoin = {
  id: string
  title: string
  authors: Author[] | null
  year: number | null
  ranking_system: string | null
  ranking_value: string | null
  source_topics: Array<{ confirmed: boolean; topics: { name: string } | null }> | null
  method_profiles: { study_type: StudyType; confirmed: boolean } | null
  source_functions: Array<{ confirmed: boolean; work_functions: { name: string } | null }> | null
}

export async function fetchConfirmedPassagesForRq(rqId: string): Promise<FfPassage[]> {
  const { data, error } = await supabase
    .from('passages')
    .select(
      `id, page, original, translation, paraphrase, citation, relevance,
       sources (
         id, title, authors, year, ranking_system, ranking_value,
         source_topics ( confirmed, topics ( name ) ),
         method_profiles ( study_type, confirmed ),
         source_functions ( confirmed, work_functions ( name ) )
       )`,
    )
    .eq('research_question_id', rqId)
    .eq('confirmed', true)
  if (error) throw error

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string
      page: number
      original: string
      translation: string | null
      paraphrase: string | null
      citation: string
      relevance: number
      sources: RawSourceJoin | null
    }
    const source = r.sources
    const topics = (source?.source_topics ?? []).filter((t) => t.confirmed).map((t) => t.topics?.name ?? '?')
    const studyType = source?.method_profiles?.confirmed ? source.method_profiles.study_type : null
    const functionName =
      (source?.source_functions ?? []).find((f) => f.confirmed)?.work_functions?.name ?? null

    return {
      id: r.id,
      page: r.page,
      original: r.original,
      translation: r.translation,
      paraphrase: r.paraphrase,
      citation: r.citation,
      relevance: r.relevance,
      source_id: source?.id ?? '',
      source_title: source?.title ?? '?',
      authors: source?.authors ?? null,
      year: source?.year ?? null,
      ranking_system: source?.ranking_system ?? null,
      ranking_value: source?.ranking_value ?? null,
      topics,
      study_type: studyType,
      function_name: functionName,
    }
  })
}

export { STUDY_TYPE_LABEL }
