import { supabase } from './supabase'
import type { Author } from './sources'

export type UsedCitationEntry = {
  passage_id: string
  page: number
  original: string
  translation: string | null
  citation: string
  research_question_id: string
  rq_code: string
  source_id: string
  authors: Author[] | null
  year: number | null
}

type RawRow = {
  passage_id: string
  passages: {
    id: string
    page: number
    original: string
    translation: string | null
    citation: string
    research_questions: { id: string; code: string } | null
    sources: { id: string; authors: Author[] | null; year: number | null } | null
  } | null
}

export async function fetchUsedCitations(documentId: string): Promise<UsedCitationEntry[]> {
  const { data, error } = await supabase
    .from('used_citations')
    .select(
      `passage_id,
       passages (
         id, page, original, translation, citation,
         research_questions ( id, code ),
         sources ( id, authors, year )
       )`,
    )
    .eq('document_id', documentId)
  if (error) throw error

  return (data as unknown as RawRow[])
    .filter((row) => row.passages !== null)
    .map((row) => {
      const p = row.passages!
      return {
        passage_id: row.passage_id,
        page: p.page,
        original: p.original,
        translation: p.translation,
        citation: p.citation,
        research_question_id: p.research_questions?.id ?? '',
        rq_code: p.research_questions?.code ?? '?',
        source_id: p.sources?.id ?? '',
        authors: p.sources?.authors ?? null,
        year: p.sources?.year ?? null,
      }
    })
}
