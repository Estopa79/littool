import { supabase } from './supabase'

export type Draft = {
  id: string
  section_id: string
  version: number
  text: string
  created_by: 'persona' | 'author'
  persona_id: string | null
  status: 'draft' | 'adopted'
  unverified_claims: Array<{ auszug: string; grund: string }>
  created_at: string
}

export type DraftPassageLink = { passage_id: string; marker: number }

export async function fetchDraftsForSection(sectionId: string): Promise<Draft[]> {
  const { data, error } = await supabase
    .from('drafts')
    .select('id, section_id, version, text, created_by, persona_id, status, unverified_claims, created_at')
    .eq('section_id', sectionId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as Draft[]
}

export async function fetchDraftPassages(draftId: string): Promise<DraftPassageLink[]> {
  const { data, error } = await supabase
    .from('draft_passages')
    .select('passage_id, marker')
    .eq('draft_id', draftId)
    .order('marker')
  if (error) throw error
  return (data ?? []) as DraftPassageLink[]
}

export type DraftJob = {
  id: string
  type: string
  status: 'pending' | 'running' | 'done' | 'failed'
  progress: number
  result: { draft_id?: string; unverified_count?: number } | null
  error: string | null
  payload: { section_id?: string; persona_id?: string; passage_ids?: string[]; version?: number }
}

export async function requestDraftGeneration(input: {
  section_id: string
  persona_id: string
  passage_ids: string[]
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-draft', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.job_id as string
}

export async function fetchJob(jobId: string): Promise<DraftJob> {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single()
  if (error) throw error
  return data as DraftJob
}

// Fuer den Fall, dass der Nutzer die Seite verlassen und wieder geoeffnet hat,
// waehrend ein Entwurf noch im Hintergrund lief (CLAUDE.md: lange Aktionen
// muessen weiterlaufen) - beim Oeffnen eines Abschnitts pruefen, ob dafuer
// noch ein Job unterwegs ist, statt den Button einfach wieder anzubieten.
export async function fetchActiveDraftJobForSection(sectionId: string): Promise<DraftJob | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('type', 'draft_generation')
    .in('status', ['pending', 'running'])
    .contains('payload', { section_id: sectionId })
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as DraftJob) ?? null
}
