import { supabase } from './supabase'
import type { Author } from './sources'
import type { StudyType } from './methodProfiles'

export type MatrixRq = { id: string; code: string }

export type MatrixRow = {
  source_id: string
  title: string
  authors: Author[] | null
  year: number | null
  ranking_system: string | null
  ranking_value: string | null
  study_type: StudyType | null
  topics: string[]
  relevance: Record<string, number>
}

export async function fetchMatrixData(): Promise<{ rqs: MatrixRq[]; rows: MatrixRow[] }> {
  const [
    { data: rqs, error: rqError },
    { data: sources, error: sourceError },
    { data: methods, error: methodError },
    { data: relevance, error: relevanceError },
    { data: sourceTopics, error: topicsError },
  ] = await Promise.all([
    supabase.from('research_questions').select('id, code').order('sort_order'),
    supabase.from('sources').select('id, title, authors, year, ranking_system, ranking_value'),
    supabase.from('method_profiles').select('source_id, study_type'),
    supabase.from('source_rq_relevance').select('source_id, research_question_id, relevance'),
    supabase.from('source_topics').select('source_id, topics(name)'),
  ])
  if (rqError) throw rqError
  if (sourceError) throw sourceError
  if (methodError) throw methodError
  if (relevanceError) throw relevanceError
  if (topicsError) throw topicsError

  const studyTypeBySource = new Map((methods ?? []).map((m) => [m.source_id, m.study_type as StudyType]))
  const relevanceBySource = new Map<string, Record<string, number>>()
  for (const r of relevance ?? []) {
    if (!relevanceBySource.has(r.source_id)) relevanceBySource.set(r.source_id, {})
    relevanceBySource.get(r.source_id)![r.research_question_id] = r.relevance
  }
  const topicsBySource = new Map<string, string[]>()
  for (const row of sourceTopics ?? []) {
    const r = row as unknown as { source_id: string; topics: { name: string } | null }
    if (!r.topics) continue
    if (!topicsBySource.has(r.source_id)) topicsBySource.set(r.source_id, [])
    topicsBySource.get(r.source_id)!.push(r.topics.name)
  }

  const rows: MatrixRow[] = (sources ?? [])
    .filter((s) => relevanceBySource.has(s.id))
    .map((s) => ({
      source_id: s.id,
      title: s.title,
      authors: s.authors,
      year: s.year,
      ranking_system: s.ranking_system,
      ranking_value: s.ranking_value,
      study_type: studyTypeBySource.get(s.id) ?? null,
      topics: topicsBySource.get(s.id) ?? [],
      relevance: relevanceBySource.get(s.id) ?? {},
    }))

  return { rqs: rqs ?? [], rows }
}

export type CellReview = { reasoning: string | null }

export async function fetchCellReasoning(sourceId: string, rqId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('source_rq_relevance')
    .select('reasoning')
    .eq('source_id', sourceId)
    .eq('research_question_id', rqId)
    .maybeSingle()
  if (error) throw error
  return data?.reasoning ?? null
}
