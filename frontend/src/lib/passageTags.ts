import { supabase } from './supabase'

// Themenfeld/Funktion direkt am einzelnen Textabschnitt (nicht nur an der
// Quelle) - Autorenwunsch: der Zitat-Pool der Schreibwerkstatt soll auch
// treffen, wenn nur ein einzelner Abschnitt einer Quelle zu einem Thema
// gehoert, nicht die ganze Quelle. Direkte, vom Autor gesetzte Verknuepfung
// (kein "confirmed"-Feld noetig - anders als source_topics/source_functions,
// die KI-Vorschlaege sind), gleiches Toggle-Muster wie
// lib/sections.ts::toggleSectionTopic/toggleSectionFunction.

export type PassageTagMaps = {
  topicsByPassage: Map<string, Set<string>>
  functionsByPassage: Map<string, Set<string>>
}

export async function fetchPassageTagsForPassages(passageIds: string[]): Promise<PassageTagMaps> {
  if (passageIds.length === 0) return { topicsByPassage: new Map(), functionsByPassage: new Map() }

  const [{ data: topicRows, error: topicError }, { data: functionRows, error: functionError }] = await Promise.all([
    supabase.from('passage_topics').select('passage_id, topic_id').in('passage_id', passageIds),
    supabase.from('passage_functions').select('passage_id, function_id').in('passage_id', passageIds),
  ])
  if (topicError) throw topicError
  if (functionError) throw functionError

  const topicsByPassage = new Map<string, Set<string>>()
  for (const row of topicRows ?? []) {
    if (!topicsByPassage.has(row.passage_id)) topicsByPassage.set(row.passage_id, new Set())
    topicsByPassage.get(row.passage_id)!.add(row.topic_id)
  }
  const functionsByPassage = new Map<string, Set<string>>()
  for (const row of functionRows ?? []) {
    if (!functionsByPassage.has(row.passage_id)) functionsByPassage.set(row.passage_id, new Set())
    functionsByPassage.get(row.passage_id)!.add(row.function_id)
  }
  return { topicsByPassage, functionsByPassage }
}

export async function togglePassageTopic(passageId: string, topicId: string, linked: boolean): Promise<void> {
  const { error } = linked
    ? await supabase.from('passage_topics').delete().eq('passage_id', passageId).eq('topic_id', topicId)
    : await supabase.from('passage_topics').insert({ passage_id: passageId, topic_id: topicId })
  if (error) throw error
}

export async function togglePassageFunction(passageId: string, functionId: string, linked: boolean): Promise<void> {
  const { error } = linked
    ? await supabase.from('passage_functions').delete().eq('passage_id', passageId).eq('function_id', functionId)
    : await supabase.from('passage_functions').insert({ passage_id: passageId, function_id: functionId })
  if (error) throw error
}
