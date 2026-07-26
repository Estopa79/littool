import { supabase } from './supabase'

export type WorkFunction = { id: string; name: string }
export type SourceFunction = { source_id: string; function_id: string; confirmed: boolean }

export async function fetchWorkFunctions(): Promise<WorkFunction[]> {
  const { data, error } = await supabase.from('work_functions').select('id, name').order('name')
  if (error) throw error
  return (data ?? []) as WorkFunction[]
}

export async function fetchSourceFunctions(sourceId: string): Promise<SourceFunction[]> {
  const { data, error } = await supabase
    .from('source_functions')
    .select('source_id, function_id, confirmed')
    .eq('source_id', sourceId)
  if (error) throw error
  return (data ?? []) as SourceFunction[]
}

// Fuer den Bibliothek-Filter: alle Zuordnungen auf einmal (Bestandsgroesse ~150, kein Paging noetig).
export async function fetchAllSourceFunctions(): Promise<SourceFunction[]> {
  const { data, error } = await supabase.from('source_functions').select('source_id, function_id, confirmed')
  if (error) throw error
  return (data ?? []) as SourceFunction[]
}

// Haendisches Setzen einer Funktion gilt als Bestaetigung (gleiches Prinzip wie
// ueberall im Tool: KI-Vorschlag = unconfirmed, manuelle Aktion des Autors = confirmed).
export async function setSourceFunction(sourceId: string, functionId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    const { error } = await supabase
      .from('source_functions')
      .upsert({ source_id: sourceId, function_id: functionId, confirmed: true })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('source_functions')
      .delete()
      .eq('source_id', sourceId)
      .eq('function_id', functionId)
    if (error) throw error
  }
}
