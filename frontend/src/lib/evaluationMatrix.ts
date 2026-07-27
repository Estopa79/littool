import { supabase } from './supabase'

export type Criterion = {
  id: string
  set_id: string
  name: string
  short_name: string
  sort_order: number
  derivation: string | null
  confirmed: boolean
}

export async function fetchCriteria(): Promise<Criterion[]> {
  const { data, error } = await supabase.from('criteria').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as Criterion[]
}

export async function addCriterion(setId: string, name: string, derivation: string): Promise<Criterion> {
  const { data: existing } = await supabase
    .from('criteria')
    .select('sort_order')
    .eq('set_id', setId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1
  const { data, error } = await supabase
    .from('criteria')
    .insert({
      set_id: setId,
      name,
      short_name: name.length > 30 ? `${name.slice(0, 27)}...` : name,
      sort_order: nextSortOrder,
      derivation: derivation || null,
      confirmed: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Criterion
}

export async function updateCriterion(
  id: string,
  patch: { name?: string; derivation?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = { ...patch, confirmed: true }
  if (patch.name !== undefined) {
    update.short_name = patch.name.length > 30 ? `${patch.name.slice(0, 27)}...` : patch.name
  }
  const { error } = await supabase.from('criteria').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteCriterion(id: string): Promise<void> {
  const { error } = await supabase.from('criteria').delete().eq('id', id)
  if (error) throw error
}

export async function ensureDefaultCriterionSet(): Promise<string> {
  const { data: existing } = await supabase.from('criterion_sets').select('id').limit(1).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase
    .from('criterion_sets')
    .insert({ name: 'Evaluationskriterien' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function suggestCriteria(): Promise<Criterion[]> {
  const { data, error } = await supabase.functions.invoke('suggest-criteria', { body: {} })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return (data.criteria ?? []) as Criterion[]
}

export type SourceCriterionValue = {
  source_id: string
  criterion_id: string
  value: number
  reasoning: string | null
  confirmed: boolean
}

export async function fetchAllSourceCriteria(): Promise<SourceCriterionValue[]> {
  const { data, error } = await supabase.from('source_criteria').select('*')
  if (error) throw error
  return (data ?? []) as SourceCriterionValue[]
}

export async function saveSourceCriterionValue(
  sourceId: string,
  criterionId: string,
  value: number,
): Promise<void> {
  const { error } = await supabase
    .from('source_criteria')
    .upsert({ source_id: sourceId, criterion_id: criterionId, value, confirmed: true })
  if (error) throw error
}

export async function generateCriteriaEvaluation(
  sourceId: string,
): Promise<Array<{ criterion_id: string; value: number; reasoning: string | null }>> {
  const { data, error } = await supabase.functions.invoke('generate-criteria-evaluation', {
    body: { source_id: sourceId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.evaluations as Array<{ criterion_id: string; value: number; reasoning: string | null }>
}
