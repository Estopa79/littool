import { supabase } from './supabase'
import type { Author } from './sources'

export type Passage = {
  id: string
  source_id: string
  research_question_id: string
  page: number
  original: string
  translation: string | null
  relevance: number
  citation: string
  confirmed: boolean
}

export type GeneratedCandidate = {
  id: string
  research_question_id: string
  research_question_code: string
  page: number
  original: string
  translation: string
  citation: string
  relevance: number
}

export type GenerateCitationsResult = {
  results: GeneratedCandidate[]
  errors: Array<{ research_question_code: string; message: string }>
  discarded: number
  message?: string
}

export async function fetchConfirmedPassagesForCell(sourceId: string, rqId: string): Promise<Passage[]> {
  const { data, error } = await supabase
    .from('passages')
    .select('id, source_id, research_question_id, page, original, translation, relevance, citation, confirmed')
    .eq('source_id', sourceId)
    .eq('research_question_id', rqId)
    .eq('confirmed', true)
  if (error) throw error
  return (data ?? []) as Passage[]
}

export async function fetchPassagesForSource(sourceId: string): Promise<Passage[]> {
  const { data, error } = await supabase
    .from('passages')
    .select('id, source_id, research_question_id, page, original, translation, relevance, citation, confirmed')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Passage[]
}

// Der eigentliche Claude-Aufruf laeuft serverseitig in der Edge Function -
// der Anthropic-Key darf nie ins Browser-Bundle (gleiches Prinzip wie beim
// Voyage-Key in der "search"-Function, Phase 2 Paket 8).
export async function generateCitations(sourceId: string): Promise<GenerateCitationsResult> {
  const { data, error } = await supabase.functions.invoke('generate-citations', {
    body: { source_id: sourceId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as GenerateCitationsResult
}

export async function confirmPassage(id: string): Promise<void> {
  const { error } = await supabase.from('passages').update({ confirmed: true }).eq('id', id)
  if (error) throw error
}

export async function discardPassage(id: string): Promise<void> {
  const { error } = await supabase.from('passages').delete().eq('id', id)
  if (error) throw error
}

// Fuer die QS-Ansicht (Paket 6): Original/Uebersetzung korrigieren und im
// selben Zug bestaetigen - eine manuelle Korrektur gilt als Bestaetigung.
export async function updateAndConfirmPassage(
  id: string,
  patch: { original: string; translation: string | null },
): Promise<void> {
  const { error } = await supabase.from('passages').update({ ...patch, confirmed: true }).eq('id', id)
  if (error) throw error
}

// Manueller Weg (aus Paket 7 vorgezogen): Text im PDF-Viewer markieren/kopieren,
// hier einfuegen - gilt sofort als bestaetigt (menschliche Aktion, kein KI-Vorschlag).
export async function addManualCitation(params: {
  sourceId: string
  researchQuestionId: string
  page: number
  original: string
  translation: string | null
  relevance: number
  authors: Author[] | null
  year: number | null
  pageOffset: number
}): Promise<Passage> {
  const { data: citation, error: citationError } = await supabase.rpc('format_citation', {
    authors: params.authors,
    p_year: params.year,
    p_page: params.page + params.pageOffset,
  })
  if (citationError) throw citationError

  const { data, error } = await supabase
    .from('passages')
    .insert({
      source_id: params.sourceId,
      research_question_id: params.researchQuestionId,
      page: params.page,
      original: params.original,
      translation: params.translation,
      relevance: params.relevance,
      citation,
      confirmed: true,
    })
    .select('id, source_id, research_question_id, page, original, translation, relevance, citation, confirmed')
    .single()
  if (error || !data) throw error ?? new Error('Zitat konnte nicht gespeichert werden')
  return data as Passage
}
