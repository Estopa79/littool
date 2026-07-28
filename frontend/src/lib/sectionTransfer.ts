import { supabase } from './supabase'

export type TransferCitationOption = { passage_id: string; label: string }

// Welche im aktiven Dokument angehakten Zitate stammen aus Entwuerfen dieses
// Abschnitts? Das ist die Menge, die beim Uebernehmen in ein anderes
// Dokument zur Auswahl steht ("Haekchen abwaehlbar", Arbeitsplan Paket 8).
export async function fetchSectionUsedCitationsForTransfer(
  sectionId: string,
  documentId: string,
): Promise<TransferCitationOption[]> {
  const { data: draftRows, error: draftError } = await supabase.from('drafts').select('id').eq('section_id', sectionId)
  if (draftError) throw draftError
  const draftIds = (draftRows ?? []).map((d) => d.id)
  if (draftIds.length === 0) return []

  const { data: dpRows, error: dpError } = await supabase
    .from('draft_passages')
    .select('passage_id')
    .in('draft_id', draftIds)
  if (dpError) throw dpError
  const passageIds = Array.from(new Set((dpRows ?? []).map((r) => r.passage_id as string)))
  if (passageIds.length === 0) return []

  const { data: usedRows, error: usedError } = await supabase
    .from('used_citations')
    .select('passage_id')
    .eq('document_id', documentId)
    .in('passage_id', passageIds)
  if (usedError) throw usedError
  const usedIds = Array.from(new Set((usedRows ?? []).map((r) => r.passage_id as string)))
  if (usedIds.length === 0) return []

  const { data: passageRows, error: passageError } = await supabase
    .from('passages')
    .select('id, citation')
    .in('id', usedIds)
  if (passageError) throw passageError

  return (passageRows ?? []).map((p) => ({ passage_id: p.id, label: p.citation }))
}

// Kopiert einen Abschnitt (Titel/Nummer, FF-/Themen-Verknuepfungen, alle
// Entwurfsversionen inkl. Belegmarker) als neuen, eigenstaendigen Abschnitt
// in ein anderes Dokument - bewusst OHNE Diskussionsbeitraege (Arbeitsplan:
// "Abschnitt samt Entwuerfen und Haekchen kopieren", Diskussion nicht
// erwaehnt - waere ohnehin ISP-spezifischer Gedankenaustausch, kein Inhalt
// des Zieldokuments). Haekchen im Zieldokument nur fuer die vom Nutzer
// bestaetigten Zitate (additiv, upsert mit ignoreDuplicates).
export async function transferSectionToDocument(input: {
  sectionId: string
  targetDocumentId: string
  citationsToCheck: string[]
}): Promise<string> {
  const { data: source, error: sourceError } = await supabase
    .from('sections')
    .select('number, title')
    .eq('id', input.sectionId)
    .single()
  if (sourceError || !source) throw sourceError ?? new Error('Abschnitt nicht gefunden')

  const { data: maxRows, error: maxError } = await supabase
    .from('sections')
    .select('sort_order')
    .eq('document_id', input.targetDocumentId)
    .is('parent_id', null)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (maxError) throw maxError
  const sortOrder = (maxRows?.[0]?.sort_order ?? -1) + 1

  const { data: newSection, error: insertError } = await supabase
    .from('sections')
    .insert({
      document_id: input.targetDocumentId,
      parent_id: null,
      number: source.number,
      title: source.title,
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (insertError || !newSection) throw insertError ?? new Error('Abschnitt konnte nicht angelegt werden')

  const [{ data: rqLinks, error: rqError }, { data: topicLinks, error: topicError }] = await Promise.all([
    supabase.from('section_research_questions').select('research_question_id').eq('section_id', input.sectionId),
    supabase.from('section_topics').select('topic_id').eq('section_id', input.sectionId),
  ])
  if (rqError) throw rqError
  if (topicError) throw topicError

  if (rqLinks && rqLinks.length > 0) {
    const { error } = await supabase
      .from('section_research_questions')
      .insert(rqLinks.map((r) => ({ section_id: newSection.id, research_question_id: r.research_question_id })))
    if (error) throw error
  }
  if (topicLinks && topicLinks.length > 0) {
    const { error } = await supabase
      .from('section_topics')
      .insert(topicLinks.map((t) => ({ section_id: newSection.id, topic_id: t.topic_id })))
    if (error) throw error
  }

  const { data: sourceDrafts, error: draftsError } = await supabase
    .from('drafts')
    .select('id, version, text, created_by, persona_id, status, unverified_claims')
    .eq('section_id', input.sectionId)
  if (draftsError) throw draftsError

  for (const d of sourceDrafts ?? []) {
    const { data: newDraft, error: newDraftError } = await supabase
      .from('drafts')
      .insert({
        section_id: newSection.id,
        version: d.version,
        text: d.text,
        created_by: d.created_by,
        persona_id: d.persona_id,
        status: d.status,
        unverified_claims: d.unverified_claims,
      })
      .select('id')
      .single()
    if (newDraftError || !newDraft) throw newDraftError ?? new Error('Entwurf konnte nicht kopiert werden')

    const { data: dpRows, error: dpError } = await supabase
      .from('draft_passages')
      .select('passage_id, marker')
      .eq('draft_id', d.id)
    if (dpError) throw dpError
    if (dpRows && dpRows.length > 0) {
      const { error } = await supabase
        .from('draft_passages')
        .insert(dpRows.map((r) => ({ draft_id: newDraft.id, passage_id: r.passage_id, marker: r.marker })))
      if (error) throw error
    }
  }

  if (input.citationsToCheck.length > 0) {
    const rows = input.citationsToCheck.map((passageId) => ({ passage_id: passageId, document_id: input.targetDocumentId }))
    const { error } = await supabase
      .from('used_citations')
      .upsert(rows, { onConflict: 'passage_id,document_id', ignoreDuplicates: true })
    if (error) throw error
  }

  return newSection.id as string
}
