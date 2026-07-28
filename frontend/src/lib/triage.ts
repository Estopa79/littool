import { supabase } from './supabase'

export type TriageReasoningEntry = { research_question_id: string; code: string; reasoning: string }
export type TriageReasoning = { overall: string; per_question: TriageReasoningEntry[] }

export type TriageSource = {
  id: string
  title: string
  storage_path: string | null
  file_hash: string | null
  doi: string | null
  triage_recommendation: 'aufnehmen' | 'grenzwertig' | 'verwerfen' | null
  triage_reasoning: TriageReasoning | null
  triage_assessed_at: string | null
  duplicate_of_rejection_id: string | null
  created_at: string
}

export type TriageRejection = {
  id: string
  title: string
  filename: string
  doi: string | null
  file_hash: string
  reason: string
  rejected_at: string
}

const TRIAGE_COLUMNS =
  'id, title, storage_path, file_hash, doi, triage_recommendation, triage_reasoning, triage_assessed_at, duplicate_of_rejection_id, created_at'

export async function fetchTriageSources(): Promise<TriageSource[]> {
  const { data, error } = await supabase
    .from('sources')
    .select(TRIAGE_COLUMNS)
    .eq('status', 'triage')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TriageSource[]
}

export async function fetchTriageRejections(): Promise<TriageRejection[]> {
  const { data, error } = await supabase
    .from('triage_rejections')
    .select('id, title, filename, doi, file_hash, reason, rejected_at')
    .order('rejected_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TriageRejection[]
}

export async function fetchRejectionById(id: string): Promise<TriageRejection | null> {
  const { data, error } = await supabase
    .from('triage_rejections')
    .select('id, title, filename, doi, file_hash, reason, rejected_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as TriageRejection) ?? null
}

// "Uebernehmen": wechselt nur den Status - die bestehende Phase-1-Pipeline
// (extract-doi, enrich-metadata, extract-fulltext, chunk, embed, ...) filtert
// bereits durchweg auf status='processing' und greift dadurch automatisch,
// ohne dass einer dieser Schritte fuer Paket E angepasst werden musste.
export async function acceptTriageSource(id: string): Promise<void> {
  const { error } = await supabase.from('sources').update({ status: 'processing' }).eq('id', id)
  if (error) throw error
}

// "Verwerfen": PDF loeschen, Merkeintrag anlegen, Quellen-Zeile entfernen
// (kaskadiert dabei ihren AiLog-Eintrag weg - konsistent mit der in Migration
// 0026 bereits getroffenen, gleichlautenden Entscheidung fuer geloeschte
// Quellen allgemein).
export async function rejectTriageSource(source: TriageSource, reason: string): Promise<void> {
  if (source.storage_path) {
    const { error: storageError } = await supabase.storage.from('pdfs').remove([source.storage_path])
    if (storageError) throw storageError
  }

  const filename = source.storage_path?.split('/').pop() ?? source.title

  const { error: insertError } = await supabase.from('triage_rejections').insert({
    title: source.title,
    filename,
    doi: source.doi,
    file_hash: source.file_hash ?? 'unbekannt',
    reason,
  })
  if (insertError) throw insertError

  const { error: deleteError } = await supabase.from('sources').delete().eq('id', source.id)
  if (deleteError) throw deleteError
}

// SHA-256 ueber die Datei-Bytes (Web Crypto, kein zusaetzliches Paket noetig) -
// Grundlage fuer den exakten Hash-Abgleich gegen die Verworfen-Liste.
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Einfache Bigramm-Aehnlichkeit (Dice-Koeffizient) fuer die Titel-Fuzzy-
// Erkennung - kein externes Paket, reicht fuer den Zweck (deutliche
// Namensgleichheit erkennen, keine wissenschaftliche Textaehnlichkeit).
function bigrams(s: string): Set<string> {
  const norm = s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim()
  const result = new Set<string>()
  for (let i = 0; i < norm.length - 1; i++) result.add(norm.slice(i, i + 2))
  return result
}

// Exportiert fuer Wiederverwendung ausserhalb von triage.ts (Paket 2, Phase 6:
// Bestand-/Verworfen-Abgleich der OpenAlex-Nachrecherche nutzt dieselbe
// Aehnlichkeits-Heuristik statt einer zweiten Implementierung).
export function titleSimilarity(a: string, b: string): number {
  const bigramsA = bigrams(a)
  const bigramsB = bigrams(b)
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0
  let overlap = 0
  for (const bg of bigramsA) if (bigramsB.has(bg)) overlap++
  return (2 * overlap) / (bigramsA.size + bigramsB.size)
}

export const TITLE_SIMILARITY_THRESHOLD = 0.85

// Wiedererkennung beim Upload (Eingang UND Direkt-Upload, s. uploadSource.ts):
// Hash exakt zuerst, sonst Titel-Fuzzy gegen den vom Dateinamen abgeleiteten
// Titel. Ein DOI-Abgleich ist an dieser Stelle bewusst nicht moeglich - die
// DOI ist vor jeder PDF-Verarbeitung noch unbekannt; sie wird stattdessen
// waehrend der Schnell-Einschaetzung (Worker `triage-assess`) nachgetragen,
// s. dortige Notizen.
export async function checkAgainstRejections(
  file: File,
  titleGuess: string,
): Promise<{ hash: string; match: TriageRejection | null }> {
  const hash = await computeFileHash(file)
  const rejections = await fetchTriageRejections()

  const exact = rejections.find((r) => r.file_hash === hash)
  if (exact) return { hash, match: exact }

  const fuzzy = rejections.find((r) => titleSimilarity(r.title, titleGuess) >= TITLE_SIMILARITY_THRESHOLD)
  return { hash, match: fuzzy ?? null }
}
