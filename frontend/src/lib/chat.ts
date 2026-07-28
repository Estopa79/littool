import { supabase } from './supabase'

export type ChatSource = {
  source_id: string
  chunk_id: string
  page: number
  citation: string
  original: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
}

export type ChatSessionSummary = {
  id: string
  title: string | null
  persona_id: string | null
  updated_at: string
}

export type ChatSession = ChatSessionSummary & {
  filters: Record<string, unknown>
  messages: ChatMessage[]
  created_at: string
}

export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, persona_id, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ChatSessionSummary[]
}

export async function fetchChatSession(id: string): Promise<ChatSession> {
  const { data, error } = await supabase.from('chat_sessions').select('*').eq('id', id).single()
  if (error) throw error
  return data as ChatSession
}

export async function renameChatSession(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function sendChatMessage(input: {
  session_id: string | null
  message: string
  persona_id: string | null
  filter_topic_id: string | null
  filter_ranking_system: string | null
  filter_study_type: string | null
  filter_source_id: string | null
}): Promise<{ session_id: string; message: ChatMessage }> {
  const { data, error } = await supabase.functions.invoke('chat-query', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return { session_id: data.session_id, message: data.message }
}

// "Stelle als Zitat-Kandidat übernehmen" - läuft durch die normale QS-Prüfung
// aus Phase 3 (confirmed: false, erscheint im Prüfen-Workflow). Der Autor
// muss die Forschungsfrage waehlen, zu der die passages-Zeile gehoert - das
// kann der Chat selbst nicht wissen (er ist FF-uebergreifend).
export async function createPassageCandidateFromChat(input: {
  sourceId: string
  researchQuestionId: string
  page: number
  original: string
  citation: string
}): Promise<void> {
  const { error } = await supabase.from('passages').insert({
    source_id: input.sourceId,
    research_question_id: input.researchQuestionId,
    page: input.page,
    original: input.original,
    citation: input.citation,
    relevance: 2,
    confirmed: false,
  })
  if (error) throw error
}
