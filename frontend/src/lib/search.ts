import { supabase } from './supabase'
import type { Author } from './sources'

export type SearchMode = 'hybrid' | 'fulltext' | 'semantic'

export type SearchHit = {
  chunk_id: string
  source_id: string
  title: string
  authors: Author[] | null
  year: number | null
  venue: string | null
  type: string | null
  ranking_system: string | null
  ranking_value: string | null
  page: number
  snippet: string
  rank: number
}

// Muss zum StartSel/StopSel in Migration 0013 passen (Private-Use-Area statt
// literaler <mark>-Tags, damit Snippets sicher gerendert werden können).
const MARK_START = ''
const MARK_END = ''

export function renderSnippetHtml(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.split(MARK_START).join('<mark>').split(MARK_END).join('</mark>')
}

export async function runSearch(params: {
  query: string
  mode: SearchMode
  filterRankingSystem?: string | null
  filterType?: string | null
  matchLimit?: number
}): Promise<SearchHit[]> {
  const { data, error } = await supabase.functions.invoke('search', {
    body: {
      query: params.query,
      mode: params.mode,
      filter_ranking_system: params.filterRankingSystem ?? null,
      filter_type: params.filterType ?? null,
      match_limit: params.matchLimit ?? 20,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return (data?.results ?? []) as SearchHit[]
}
