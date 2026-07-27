import { supabase } from './supabase'

export type DescriptiveEntry = {
  source_id: string
  included: boolean
  einordnung: string | null
  theoretische_fundierung: string | null
  stichprobe: string | null
  analysemethode: string | null
  erkenntnisse: string | null
  confirmed: boolean
}

export async function fetchAllDescriptiveEntries(): Promise<DescriptiveEntry[]> {
  const { data, error } = await supabase.from('descriptive_matrix_entries').select('*')
  if (error) throw error
  return (data ?? []) as DescriptiveEntry[]
}

export async function setIncluded(sourceId: string, included: boolean): Promise<void> {
  const { error } = await supabase
    .from('descriptive_matrix_entries')
    .upsert({ source_id: sourceId, included })
  if (error) throw error
}

export async function saveDescriptiveField(
  sourceId: string,
  field: 'einordnung' | 'theoretische_fundierung' | 'stichprobe' | 'analysemethode' | 'erkenntnisse',
  value: string,
): Promise<void> {
  const { error } = await supabase
    .from('descriptive_matrix_entries')
    .upsert({ source_id: sourceId, [field]: value || null, confirmed: true })
  if (error) throw error
}

export type GeneratedDescriptiveEntry = {
  einordnung: string | null
  theoretische_fundierung: string | null
  stichprobe: string | null
  analysemethode: string | null
  erkenntnisse: string | null
}

export async function generateDescriptiveEntry(sourceId: string): Promise<GeneratedDescriptiveEntry> {
  const { data, error } = await supabase.functions.invoke('generate-descriptive-entry', {
    body: { source_id: sourceId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as GeneratedDescriptiveEntry
}
