import { supabase } from './supabase'

export type AppSettings = {
  dissertation_theme: string | null
}

export type ResearchQuestion = {
  id: string
  code: string
  question: string
  sort_order: number
}

export type Topic = {
  id: string
  name: string
  description: string | null
  sort_order: number
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('dissertation_theme')
    .eq('id', true)
    .single()
  if (error) throw error
  return data as AppSettings
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) throw error
}

export async function fetchResearchQuestions(): Promise<ResearchQuestion[]> {
  const { data, error } = await supabase
    .from('research_questions')
    .select('id, code, question, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as ResearchQuestion[]
}

export async function createResearchQuestion(
  rq: Omit<ResearchQuestion, 'id'>,
): Promise<ResearchQuestion> {
  const { data, error } = await supabase
    .from('research_questions')
    .insert(rq)
    .select('id, code, question, sort_order')
    .single()
  if (error) throw error
  return data as ResearchQuestion
}

export async function updateResearchQuestion(
  id: string,
  patch: Partial<Omit<ResearchQuestion, 'id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('research_questions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteResearchQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('research_questions').delete().eq('id', id)
  if (error) throw error
}

export async function fetchTopics(): Promise<Topic[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('id, name, description, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Topic[]
}

export async function createTopic(topic: Omit<Topic, 'id'>): Promise<Topic> {
  const { data, error } = await supabase
    .from('topics')
    .insert(topic)
    .select('id, name, description')
    .single()
  if (error) throw error
  return data as Topic
}

export async function updateTopic(id: string, patch: Partial<Omit<Topic, 'id'>>): Promise<void> {
  const { error } = await supabase
    .from('topics')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await supabase.from('topics').delete().eq('id', id)
  if (error) throw error
}
