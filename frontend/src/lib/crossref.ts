import { supabase } from './supabase'
import type { Author } from './sources'

export type CrossrefMetadata = {
  title: string | null
  authors: Author[] | null
  year: number | null
  venue: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  issn: string | null
  type: string | null
}

export async function fetchCrossrefMetadata(doi: string): Promise<CrossrefMetadata | null> {
  const { data, error } = await supabase.functions.invoke('fetch-crossref-metadata', { body: { doi } })
  if (error) throw error
  if (data?.error && !data?.data) return null
  return (data?.data ?? null) as CrossrefMetadata | null
}
