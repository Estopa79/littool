import { supabase } from './supabase'
import type { DraftJob } from './drafts'

export async function requestDebate(input: {
  section_id: string
  draft_id: string
  persona_ids: string[]
  round_limit: number
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('run-debate', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.job_id as string
}

// Gleiche Job-Wiederaufnahme-Logik wie bei Entwuerfen (Paket 5) - eine
// Debatte kann mehrere Minuten laufen, der Nutzer soll die Seite verlassen
// und spaeter zurueckkommen koennen, ohne den Fortschritt zu verlieren.
export async function fetchActiveDebateJobForSection(sectionId: string): Promise<DraftJob | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('type', 'debate')
    .in('status', ['pending', 'running'])
    .contains('payload', { section_id: sectionId })
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as DraftJob) ?? null
}

// Setzt den Job nur auf 'cancelled', wenn er noch nicht fertig/fehlgeschlagen
// ist - der Hintergrund-Job prueft das vor jeder neuen Runde und bricht dann
// kontrolliert ab (inkl. Abschluss-Zusammenfassung).
export async function cancelJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['pending', 'running'])
  if (error) throw error
}
