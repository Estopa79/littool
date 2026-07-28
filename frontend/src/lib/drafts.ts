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

// Generische Job-Zeile - wird sowohl fuer Entwurfs-Generierung (Paket 5) als
// auch fuer Debatten (Paket 7) verwendet, gleiche Tabelle/Struktur, nur
// unterschiedliches `type`/`payload`.
export type DraftJob = {
  id: string
  type: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  result: { draft_id?: string; unverified_count?: number; rounds_completed?: number; turns?: number } | null
  error: string | null
  payload: {
    section_id?: string
    persona_id?: string
    passage_ids?: string[]
    version?: number
    draft_id?: string
    persona_ids?: string[]
    round_limit?: number
  }
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

// Phase 5, Paket 8: "Version übernehmen" - markiert die Version als
// Arbeitsstand (nur eine je Abschnitt, eine vorher adoptierte Version faellt
// automatisch zurueck auf 'draft') und hakt alle darin per Marker zitierten
// Passagen im aktiven Dokument an. Rein additiv (upsert mit
// ignoreDuplicates) - ein bereits gesetztes Haekchen (von hier oder von Hand)
// wird nie entfernt, auch nicht beim Wechsel auf eine andere Version.
export async function adoptDraft(draftId: string, sectionId: string, documentId: string): Promise<void> {
  const { error: resetError } = await supabase
    .from('drafts')
    .update({ status: 'draft' })
    .eq('section_id', sectionId)
    .eq('status', 'adopted')
    .neq('id', draftId)
  if (resetError) throw resetError

  const { error: adoptError } = await supabase.from('drafts').update({ status: 'adopted' }).eq('id', draftId)
  if (adoptError) throw adoptError

  const { data: draftPassageRows, error: dpError } = await supabase
    .from('draft_passages')
    .select('passage_id')
    .eq('draft_id', draftId)
  if (dpError) throw dpError

  if (draftPassageRows && draftPassageRows.length > 0) {
    const rows = draftPassageRows.map((r) => ({ passage_id: r.passage_id, document_id: documentId }))
    const { error: usedError } = await supabase
      .from('used_citations')
      .upsert(rows, { onConflict: 'passage_id,document_id', ignoreDuplicates: true })
    if (usedError) throw usedError
  }
}

// "Text kopieren": ersetzt [n]-Marker durch die ausformulierte APA-Zitation
// der referenzierten Passage. Bewusst OHNE Uebersetzungs-Kennzeichnung aus
// Phase 4: ein Marker steht fuer eine vom Agenten synthetisierte, mit
// eigenen Worten formulierte Aussage (kein woertliches Zitat/keine woertliche
// Uebersetzung) - analog zur bestehenden "Paraphrase"-Kopiervariante in
// CitationCopyButtons.tsx, die ebenfalls keinen Uebersetzungs-Hinweis traegt.
// Marker ohne bekannte Zuordnung bleiben unveraendert stehen, statt sie
// stillschweigend verschwinden zu lassen.
export function buildCopyableDraftText(
  text: string,
  markerToPassageId: Map<number, string>,
  passageCitations: Map<string, string>,
): string {
  return text.replace(/\[(\d+)\]/g, (match, n: string) => {
    const passageId = markerToPassageId.get(Number(n))
    const citation = passageId ? passageCitations.get(passageId) : undefined
    return citation ?? match
  })
}
