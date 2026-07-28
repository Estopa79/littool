import { supabase } from './supabase'

export type DocxReviewStatus = 'pending' | 'running' | 'done' | 'failed'

export type DocxReviewSummary = {
  zitate_gefunden: number
  verzeichnis_eintraege: number
  fehler: number
  warnung: number
  hinweis: number
}

export type DocxReview = {
  id: string
  document_id: string | null
  filename: string
  storage_path: string
  status: DocxReviewStatus
  error: string | null
  summary: DocxReviewSummary | null
  created_at: string
  completed_at: string | null
}

export type FindingSeverity = 'fehler' | 'warnung' | 'hinweis'

export type DocxReviewFinding = {
  id: string
  review_id: string
  severity: FindingSeverity
  category: string
  doc_location: string | null
  context_snippet: string | null
  description: string
  suggestion: string | null
  source_id: string | null
}

const REVIEW_COLUMNS =
  'id, document_id, filename, storage_path, status, error, summary, created_at, completed_at'

export async function fetchDocxReviews(): Promise<DocxReview[]> {
  const { data, error } = await supabase
    .from('docx_reviews')
    .select(REVIEW_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocxReview[]
}

export async function fetchDocxReview(id: string): Promise<DocxReview> {
  const { data, error } = await supabase.from('docx_reviews').select(REVIEW_COLUMNS).eq('id', id).single()
  if (error) throw error
  return data as DocxReview
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { fehler: 0, warnung: 1, hinweis: 2 }

export async function fetchDocxReviewFindings(reviewId: string): Promise<DocxReviewFinding[]> {
  const { data, error } = await supabase
    .from('docx_review_findings')
    .select('id, review_id, severity, category, doc_location, context_snippet, description, suggestion, source_id')
    .eq('review_id', reviewId)
  if (error) throw error
  return ((data ?? []) as DocxReviewFinding[]).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// Upload + Review-Zeile anlegen - die eigentliche Analyse laeuft danach
// manuell per Worker-Befehl (`littool-worker docx-review --review-id ...`),
// gleiches Muster wie die Schnell-Einschaetzung im Eingang-Tab (Paket E):
// Hintergrund-Verarbeitung, die auf rohe Datei-Bytes angewiesen ist, bleibt
// Domaene des Python-Workers.
export async function uploadDocxForReview(file: File, documentId: string | null): Promise<DocxReview> {
  const path = `${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage
    .from('docx_reviews')
    .upload(path, file, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('docx_reviews')
    .insert({ document_id: documentId, filename: file.name, storage_path: path, status: 'pending' })
    .select(REVIEW_COLUMNS)
    .single()
  if (error) throw error
  return data as DocxReview
}

export async function deleteDocxReview(review: DocxReview): Promise<void> {
  const { error: storageError } = await supabase.storage.from('docx_reviews').remove([review.storage_path])
  if (storageError) throw storageError
  const { error } = await supabase.from('docx_reviews').delete().eq('id', review.id)
  if (error) throw error
}
