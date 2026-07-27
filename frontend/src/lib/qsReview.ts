import { supabase } from './supabase'

export type ReviewCount = { source_id: string; title: string; count: number }

type RawUnconfirmed = { source_id: string; title: string }

async function fetchUnconfirmedFrom(table: string): Promise<RawUnconfirmed[]> {
  const { data, error } = await supabase.from(table).select('source_id, sources(title)').eq('confirmed', false)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as unknown as { source_id: string; sources: { title: string } | null }
    return { source_id: row.source_id, title: row.sources?.title ?? '?' }
  })
}

// Aggregiert die unbestaetigten Zeilen aus allen fuenf KI-Dimensionen pro
// Quelle - Bestandsgroesse (~150 Quellen, wenige hundert Zeilen je Tabelle)
// erlaubt das clientseitige Zusammenzaehlen ohne eigene SQL-Funktion.
export async function fetchReviewCounts(): Promise<ReviewCount[]> {
  const [topics, relevance, passages, methods, functions] = await Promise.all([
    fetchUnconfirmedFrom('source_topics'),
    fetchUnconfirmedFrom('source_rq_relevance'),
    fetchUnconfirmedFrom('passages'),
    fetchUnconfirmedFrom('method_profiles'),
    fetchUnconfirmedFrom('source_functions'),
  ])
  const map = new Map<string, ReviewCount>()
  for (const row of [...topics, ...relevance, ...passages, ...methods, ...functions]) {
    const existing = map.get(row.source_id)
    if (existing) existing.count += 1
    else map.set(row.source_id, { source_id: row.source_id, title: row.title, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export type ReviewTopic = { source_id: string; topic_id: string; topic_name: string; confirmed: boolean }
export type TopicOption = { id: string; name: string }

export async function fetchSourceTopics(sourceId: string): Promise<ReviewTopic[]> {
  const { data, error } = await supabase
    .from('source_topics')
    .select('source_id, topic_id, confirmed, topics(name)')
    .eq('source_id', sourceId)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as unknown as { source_id: string; topic_id: string; confirmed: boolean; topics: { name: string } | null }
    return { source_id: row.source_id, topic_id: row.topic_id, confirmed: row.confirmed, topic_name: row.topics?.name ?? '?' }
  })
}

export type SourceTopicRow = { source_id: string; topic_id: string }

// Fuer den Bibliothek-Filter: alle Zuordnungen auf einmal (Bestandsgroesse
// ~100, kein Paging noetig) - gleiches Muster wie fetchAllSourceFunctions.
export async function fetchAllSourceTopics(): Promise<SourceTopicRow[]> {
  const { data, error } = await supabase.from('source_topics').select('source_id, topic_id')
  if (error) throw error
  return (data ?? []) as SourceTopicRow[]
}

export async function fetchAllTopics(): Promise<TopicOption[]> {
  const { data, error } = await supabase.from('topics').select('id, name').order('name')
  if (error) throw error
  return (data ?? []) as TopicOption[]
}

export async function confirmTopic(sourceId: string, topicId: string): Promise<void> {
  const { error } = await supabase
    .from('source_topics')
    .update({ confirmed: true })
    .eq('source_id', sourceId)
    .eq('topic_id', topicId)
  if (error) throw error
}

export async function removeTopic(sourceId: string, topicId: string): Promise<void> {
  const { error } = await supabase.from('source_topics').delete().eq('source_id', sourceId).eq('topic_id', topicId)
  if (error) throw error
}

export async function addTopic(sourceId: string, topicId: string): Promise<void> {
  const { error } = await supabase
    .from('source_topics')
    .upsert({ source_id: sourceId, topic_id: topicId, confirmed: true })
  if (error) throw error
}

export type ReviewRelevance = {
  source_id: string
  research_question_id: string
  rq_code: string
  relevance: number
  reasoning: string | null
  confirmed: boolean
}

export async function fetchSourceRelevance(sourceId: string): Promise<ReviewRelevance[]> {
  const { data, error } = await supabase
    .from('source_rq_relevance')
    .select('source_id, research_question_id, relevance, reasoning, confirmed, research_questions(code)')
    .eq('source_id', sourceId)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      source_id: string
      research_question_id: string
      relevance: number
      reasoning: string | null
      confirmed: boolean
      research_questions: { code: string } | null
    }
    return { ...row, rq_code: row.research_questions?.code ?? '?' }
  })
}

export async function saveRelevance(sourceId: string, rqId: string, relevance: number): Promise<void> {
  const { error } = await supabase
    .from('source_rq_relevance')
    .update({ relevance, confirmed: true, updated_at: new Date().toISOString() })
    .eq('source_id', sourceId)
    .eq('research_question_id', rqId)
  if (error) throw error
}
