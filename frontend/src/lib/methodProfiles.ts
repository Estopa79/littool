import { supabase } from './supabase'

export type StudyType = 'qualitativ' | 'quantitativ' | 'mixed' | 'konzeptionell' | 'review' | 'nicht_anwendbar'

export type MethodProfile = {
  source_id: string
  study_type: StudyType
  method: string | null
  data_basis: string | null
  analysis_method: string | null
  page_hint: number | null
  confirmed: boolean
}

export const STUDY_TYPE_LABEL: Record<StudyType, string> = {
  qualitativ: 'Qualitativ',
  quantitativ: 'Quantitativ',
  mixed: 'Mixed Methods',
  konzeptionell: 'Konzeptionell',
  review: 'Review',
  nicht_anwendbar: 'Nicht anwendbar',
}

// Fuer die Methodentabelle (Phase 6, Paket 3): alle Profile auf einmal,
// gleiches Muster wie fetchAllSourceTopics/fetchAllSourceFunctions
// (Bestandsgroesse macht Einzelabfragen pro Zeile unnoetig).
export async function fetchAllMethodProfiles(): Promise<MethodProfile[]> {
  const { data, error } = await supabase
    .from('method_profiles')
    .select('source_id, study_type, method, data_basis, analysis_method, page_hint, confirmed')
  if (error) throw error
  return (data ?? []) as MethodProfile[]
}

export async function fetchMethodProfile(sourceId: string): Promise<MethodProfile | null> {
  const { data, error } = await supabase
    .from('method_profiles')
    .select('source_id, study_type, method, data_basis, analysis_method, page_hint, confirmed')
    .eq('source_id', sourceId)
    .maybeSingle()
  if (error) throw error
  return data as MethodProfile | null
}

export async function confirmMethodProfile(sourceId: string): Promise<void> {
  const { error } = await supabase.from('method_profiles').update({ confirmed: true }).eq('source_id', sourceId)
  if (error) throw error
}
