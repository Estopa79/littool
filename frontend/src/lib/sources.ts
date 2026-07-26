import { supabase } from './supabase'

export type Author = { given: string; family: string }

export type SourceStatus = 'processing' | 'needs_review' | 'complete' | 'failed'
export type ExtractionStatus = 'extracted' | 'ocr_done' | 'extraction_failed' | null

export type AnalysisStatus = 'complete' | 'failed' | null

export type Source = {
  id: string
  type: string | null
  title: string
  authors: Author[] | null
  year: number | null
  venue: string | null
  ranking_system: string | null
  ranking_value: string | null
  status: SourceStatus
  status_hint: string | null
  extraction_status: ExtractionStatus
  extraction_hint: string | null
  storage_path: string | null
  analysis_status: AnalysisStatus
}

export type SourceDetail = Source & {
  volume: string | null
  issue: string | null
  pages: string | null
  page_offset: number
  issn: string | null
  doi: string | null
  abstract: string | null
  citation_count: number | null
  url: string | null
  analysis_hint: string | null
}

const SOURCE_COLUMNS =
  'id, type, title, authors, year, venue, ranking_system, ranking_value, status, status_hint, extraction_status, extraction_hint, storage_path, analysis_status'

const DETAIL_COLUMNS = `${SOURCE_COLUMNS}, volume, issue, pages, page_offset, issn, doi, abstract, citation_count, url, analysis_hint`

export async function fetchSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select(SOURCE_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Source[]
}

export async function fetchSource(id: string): Promise<SourceDetail> {
  const { data, error } = await supabase.from('sources').select(DETAIL_COLUMNS).eq('id', id).single()

  if (error) throw error
  return data as SourceDetail
}

export async function updateSource(id: string, patch: Partial<SourceDetail>): Promise<void> {
  const { error } = await supabase.from('sources').update(patch).eq('id', id)
  if (error) throw error
}

export async function createSource(patch: Partial<SourceDetail> & { title: string }): Promise<string> {
  const { data, error } = await supabase.from('sources').insert(patch).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function attachPdf(id: string, file: File): Promise<void> {
  const path = `${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(path, file, { contentType: 'application/pdf' })
  if (uploadError) throw uploadError

  await updateSource(id, { storage_path: path })
}

export async function getSignedPdfUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('pdfs').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

// Endgueltiges Loeschen (mit Bestaetigungsdialog im UI): PDF aus dem Storage
// entfernen, dann die Quelle selbst - alle abhaengigen Zeilen (Chunks,
// Passagen, Themen-/Relevanz-/Funktion-/Kriterien-Zuordnungen) haengen per
// Cascade an der Quelle und verschwinden automatisch mit.
export async function deleteSource(id: string, storagePath: string | null): Promise<void> {
  if (storagePath) {
    const { error: storageError } = await supabase.storage.from('pdfs').remove([storagePath])
    if (storageError) throw storageError
  }
  const { error } = await supabase.from('sources').delete().eq('id', id)
  if (error) throw error
}
