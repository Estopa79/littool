import { supabase } from './supabase'
import type { Draft } from './drafts'

export type DiscussionEntry = {
  id: string
  section_id: string
  draft_id: string
  author_type: 'persona' | 'user'
  persona_id: string | null
  persona_name: string | null
  text: string
  created_at: string
}

type RawEntryRow = {
  id: string
  section_id: string
  draft_id: string
  author_type: 'persona' | 'user'
  persona_id: string | null
  text: string
  created_at: string
  personas: { name: string } | null
}

export async function fetchDiscussionEntries(draftId: string): Promise<DiscussionEntry[]> {
  const { data, error } = await supabase
    .from('discussion_entries')
    .select('id, section_id, draft_id, author_type, persona_id, text, created_at, personas(name)')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as RawEntryRow[]).map((row) => ({
    id: row.id,
    section_id: row.section_id,
    draft_id: row.draft_id,
    author_type: row.author_type,
    persona_id: row.persona_id,
    persona_name: row.personas?.name ?? null,
    text: row.text,
    created_at: row.created_at,
  }))
}

export async function postUserComment(sectionId: string, draftId: string, text: string): Promise<DiscussionEntry> {
  const { data, error } = await supabase
    .from('discussion_entries')
    .insert({ section_id: sectionId, draft_id: draftId, author_type: 'user', text })
    .select('id, section_id, draft_id, author_type, persona_id, text, created_at')
    .single()
  if (error) throw error
  return { ...data, persona_name: null } as DiscussionEntry
}

export async function requestReaction(input: {
  section_id: string
  draft_id: string
  persona_id: string
}): Promise<DiscussionEntry> {
  const { data, error } = await supabase.functions.invoke('generate-reaction', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.entry as DiscussionEntry
}

export type ReviewResult = { draft: Draft; entry: DiscussionEntry }

export async function reviewOwnText(input: {
  section_id: string
  text: string
  persona_id: string
}): Promise<ReviewResult> {
  const { data, error } = await supabase.functions.invoke('review-own-text', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return { draft: data.draft as Draft, entry: data.entry as DiscussionEntry }
}
