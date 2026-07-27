import { supabase } from './supabase'

export type SectionRow = {
  id: string
  document_id: string
  parent_id: string | null
  number: string | null
  title: string
  sort_order: number
}

export type SectionNode = SectionRow & { children: SectionNode[] }

export type Rq = { id: string; code: string; question: string }

export async function fetchSections(documentId: string): Promise<SectionRow[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('id, document_id, parent_id, number, title, sort_order')
    .eq('document_id', documentId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as SectionRow[]
}

// Baumaufbau rein clientseitig aus der flachen Liste (gleiche Bestandsgroessen-
// Annahme wie an anderer Stelle im Tool) - vermeidet rekursive Queries.
export function buildTree(rows: SectionRow[]): SectionNode[] {
  const byId = new Map<string, SectionNode>()
  for (const row of rows) byId.set(row.id, { ...row, children: [] })

  const roots: SectionNode[] = []
  for (const row of rows) {
    const node = byId.get(row.id)!
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortRec(nodes: SectionNode[]) {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

export async function createSection(input: {
  document_id: string
  parent_id: string | null
  number: string | null
  title: string
  sort_order: number
}): Promise<SectionRow> {
  const { data, error } = await supabase.from('sections').insert(input).select().single()
  if (error) throw error
  return data as SectionRow
}

export async function updateSection(
  id: string,
  patch: Partial<Pick<SectionRow, 'number' | 'title' | 'parent_id' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase
    .from('sections')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSection(id: string): Promise<void> {
  const { error } = await supabase.from('sections').delete().eq('id', id)
  if (error) throw error
}

// Tauscht sort_order mit dem direkten Geschwister in Bewegungsrichtung -
// bewusst kein Drag&Drop (kein zusaetzlicher Abhaengigkeit fuer etwas, das
// zwei Buttons genauso gut leisten, CLAUDE.md "schlank bleiben").
export async function moveSection(
  section: SectionRow,
  siblings: SectionRow[],
  direction: 'up' | 'down',
): Promise<void> {
  const sorted = [...siblings].sort((a, b) => a.sort_order - b.sort_order)
  const idx = sorted.findIndex((s) => s.id === section.id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
  const other = sorted[swapIdx]

  const { error: e1 } = await supabase.from('sections').update({ sort_order: other.sort_order }).eq('id', section.id)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('sections').update({ sort_order: section.sort_order }).eq('id', other.id)
  if (e2) throw e2
}

// Naechste freie sort_order unter den bereits geladenen Geschwistern -
// clientseitig aus dem ohnehin geladenen Bestand der Ansicht berechnet,
// spart eine Extra-Abfrage bei jedem "+ Abschnitt"/"+ Unter"-Klick.
export function nextSiblingSortOrder(rows: SectionRow[], parentId: string | null): number {
  const siblings = rows.filter((r) => r.parent_id === parentId)
  if (siblings.length === 0) return 0
  return Math.max(...siblings.map((r) => r.sort_order)) + 1
}

// Abschnitt selbst + alle Nachfahren - verhindert im Reparenting-Dropdown,
// dass ein Abschnitt (versehentlich) unter sich selbst gehaengt wird.
export function collectDescendantIds(rows: SectionRow[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const row of rows) {
      if (row.parent_id && result.has(row.parent_id) && !result.has(row.id)) {
        result.add(row.id)
        added = true
      }
    }
  }
  return result
}

export async function fetchAllResearchQuestions(): Promise<Rq[]> {
  const { data, error } = await supabase.from('research_questions').select('id, code, question').order('sort_order')
  if (error) throw error
  return (data ?? []) as Rq[]
}

export async function fetchSectionLinks(sectionId: string): Promise<{ rqIds: Set<string>; topicIds: Set<string> }> {
  const [{ data: rqRows, error: rqError }, { data: topicRows, error: topicError }] = await Promise.all([
    supabase.from('section_research_questions').select('research_question_id').eq('section_id', sectionId),
    supabase.from('section_topics').select('topic_id').eq('section_id', sectionId),
  ])
  if (rqError) throw rqError
  if (topicError) throw topicError
  return {
    rqIds: new Set((rqRows ?? []).map((r) => r.research_question_id as string)),
    topicIds: new Set((topicRows ?? []).map((r) => r.topic_id as string)),
  }
}

export async function toggleSectionRq(sectionId: string, rqId: string, linked: boolean): Promise<void> {
  const { error } = linked
    ? await supabase.from('section_research_questions').delete().eq('section_id', sectionId).eq('research_question_id', rqId)
    : await supabase.from('section_research_questions').insert({ section_id: sectionId, research_question_id: rqId })
  if (error) throw error
}

export async function toggleSectionTopic(sectionId: string, topicId: string, linked: boolean): Promise<void> {
  const { error } = linked
    ? await supabase.from('section_topics').delete().eq('section_id', sectionId).eq('topic_id', topicId)
    : await supabase.from('section_topics').insert({ section_id: sectionId, topic_id: topicId })
  if (error) throw error
}

// --- Schnellerfassung: eingerueckter Text -> Baum ---------------------------

export type ParsedOutlineLine = { number: string | null; title: string; depth: number }

// Erkennt eine fuehrende Nummer/Label ("1", "1.2.3", "1.2.3.", "A", "A.1")
// gefolgt von Whitespace und dem eigentlichen Titel. Ohne Treffer gilt die
// ganze Zeile als Titel ohne Nummer (number bleibt null, s. Migration 0032 -
// nullable fuer genau diesen Schnellerfassungs-Fall).
const NUMBER_PATTERN = /^([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)\.?\s+(.+)$/

export function parseOutline(text: string): ParsedOutlineLine[] {
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, '    '))
  const lines = rawLines.filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  const indents = lines.map((l) => l.length - l.trimStart().length)
  const uniqueIndents = Array.from(new Set(indents)).sort((a, b) => a - b)

  return lines.map((line, i) => {
    const trimmed = line.trim()
    const depth = uniqueIndents.indexOf(indents[i])
    const match = trimmed.match(NUMBER_PATTERN)
    if (match) {
      return { number: match[1], title: match[2].trim(), depth }
    }
    return { number: null, title: trimmed, depth }
  })
}

// Legt die geparste Gliederung als neue Abschnitte an - haengt sie unter den
// bestehenden Top-Level-Abschnitten an (kein Ersetzen/Loeschen vorhandener
// Daten). Neue Eltern-Abschnitte sind in diesem Lauf immer frisch, daher
// starten ihre Kind-Zaehler jeweils bei 0; nur die Root-Ebene muss den
// bestehenden Bestand fortsetzen.
export async function createSectionsFromOutline(documentId: string, lines: ParsedOutlineLine[]): Promise<number> {
  if (lines.length === 0) return 0

  const { data: rootMaxRows, error: rootMaxError } = await supabase
    .from('sections')
    .select('sort_order')
    .eq('document_id', documentId)
    .is('parent_id', null)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (rootMaxError) throw rootMaxError
  let rootCounter = (rootMaxRows?.[0]?.sort_order ?? -1) + 1

  const stack: Array<{ depth: number; id: string }> = []
  const siblingCounters = new Map<string, number>()

  let created = 0
  for (const line of lines) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) {
      stack.pop()
    }
    const parentId = stack[stack.length - 1]?.id ?? null
    const key = parentId ?? '__root__'
    const sortOrder = key === '__root__' ? rootCounter++ : (siblingCounters.get(key) ?? 0)
    siblingCounters.set(key, sortOrder + 1)

    const inserted = await createSection({
      document_id: documentId,
      parent_id: parentId,
      number: line.number,
      title: line.title,
      sort_order: sortOrder,
    })

    stack.push({ depth: line.depth, id: inserted.id })
    created++
  }
  return created
}
