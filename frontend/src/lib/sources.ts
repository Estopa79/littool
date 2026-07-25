import { supabase } from './supabase'

export type Author = { given: string; family: string }

export type SourceStatus = 'processing' | 'needs_review' | 'complete' | 'failed'

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
}

const SOURCE_COLUMNS =
  'id, type, title, authors, year, venue, ranking_system, ranking_value, status, status_hint'

export async function fetchSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select(SOURCE_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Source[]
}
