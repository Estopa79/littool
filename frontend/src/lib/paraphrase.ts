import { supabase } from './supabase'

export async function generateParaphrase(params: {
  text: string
  sourceId: string
  passageId?: string
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('paraphrase-passage', {
    body: { text: params.text, source_id: params.sourceId, passage_id: params.passageId ?? null },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.paraphrase as string
}

export async function savePassageParaphrase(passageId: string, paraphrase: string): Promise<void> {
  const { error } = await supabase
    .from('passages')
    .update({ paraphrase, updated_at: new Date().toISOString() })
    .eq('id', passageId)
  if (error) throw error
}
