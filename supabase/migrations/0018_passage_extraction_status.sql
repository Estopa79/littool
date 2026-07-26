-- Phase 3, Paket 4: Extraktions-Status je Quelle-FF-Paar + Semantik-Suche
-- innerhalb einer Quelle
--
-- Resumability fuer die Passagen-Extraktion braucht einen Status pro
-- (source_id, research_question_id)-Paar, nicht pro Quelle - eine Quelle kann
-- fuer mehrere Forschungsfragen relevant sein (Paket 3) und jedes Paar wird
-- unabhaengig extrahiert. Gleiches Muster wie sources.extraction_status/
-- analysis_status, nur auf source_rq_relevance statt sources.

alter table public.source_rq_relevance
  add column passage_extraction_status text
    check (passage_extraction_status in ('complete', 'failed')),
  add column passage_extraction_hint text;

-- Naechste-Nachbarn-Suche innerhalb einer einzelnen Quelle (statt ueber den
-- ganzen Bestand wie search_semantic aus Phase 2) - fuer die semantische
-- Vorauswahl der Chunks, die zu einer Forschungsfrage passen. Gleiches
-- sicheres Muster wie 0011 (Filter in derselben Subquery wie ORDER BY+LIMIT,
-- damit der HNSW-Index genutzt wird).

create or replace function public.search_chunks_within_source(
  query_embedding vector(1024),
  filter_source_id uuid,
  match_limit int default 6
)
returns table (
  chunk_id uuid,
  page int,
  chunk_index int,
  text text
)
language sql
stable
as $$
  select c.id as chunk_id, c.page, c.chunk_index, c.text
  from public.chunks c
  where c.source_id = filter_source_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_limit;
$$;

revoke all on function public.search_chunks_within_source(vector, uuid, int) from public;
grant execute on function public.search_chunks_within_source(vector, uuid, int) to authenticated;
