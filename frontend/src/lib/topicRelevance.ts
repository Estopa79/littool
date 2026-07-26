import { supabase } from './supabase'

export type TopicRelevanceResult = {
  topics: string[]
  relevance: Array<{
    research_question_id: string
    research_question_code: string
    relevance: number
    reasoning: string | null
  }>
}

export async function generateTopicRelevance(sourceId: string): Promise<TopicRelevanceResult> {
  const { data, error } = await supabase.functions.invoke('generate-topic-relevance', {
    body: { source_id: sourceId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as TopicRelevanceResult
}
