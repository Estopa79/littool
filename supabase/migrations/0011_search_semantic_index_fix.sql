-- Phase 2, Paket 6 (Fix): search_semantic aus Migration 0010 lief in einen
-- Statement-Timeout, sobald sie gegen den echten Bestand (18.886 Chunks)
-- lief statt gegen die 3 Test-Chunks aus Paket 1.
--
-- Ursache: match_threshold wurde als zusätzliche WHERE-Bedingung auf
-- (1 - (embedding <=> query_embedding)) formuliert. Der Planer konnte dadurch
-- die "ORDER BY embedding <=> $1 LIMIT n"-Form nicht mehr sauber auf den
-- HNSW-Index (Migration 0007) abbilden und ist auf einen Sequential Scan samt
-- Distanzberechnung für jeden einzelnen Chunk ausgewichen.
--
-- Fix: die Nächste-Nachbarn-Suche (samt ORDER BY + LIMIT, damit der Index
-- greift) läuft jetzt in einer inneren Subquery unverändert von zusätzlichen
-- Bedingungen; der optionale Schwellwert filtert erst danach auf dem bereits
-- kleinen Ergebnis.

create or replace function public.search_semantic(
  query_embedding vector(1024),
  filter_ranking_system text default null,
  filter_type text default null,
  match_limit int default 20,
  match_threshold real default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  title text,
  authors jsonb,
  year int,
  venue text,
  type text,
  ranking_system text,
  ranking_value text,
  page int,
  snippet text,
  rank real
)
language sql
stable
as $$
  select *
  from (
    select
      c.id as chunk_id,
      s.id as source_id,
      s.title,
      s.authors,
      s.year,
      s.venue,
      s.type,
      s.ranking_system,
      s.ranking_value,
      c.page,
      c.text as snippet,
      (1 - (c.embedding <=> query_embedding))::real as rank
    from public.chunks c
    join public.sources s on s.id = c.source_id
    where c.embedding is not null
      and (filter_ranking_system is null or s.ranking_system = filter_ranking_system)
      and (filter_type is null or s.type = filter_type)
    order by c.embedding <=> query_embedding
    limit match_limit
  ) matches
  where match_threshold is null or rank >= match_threshold;
$$;

revoke all on function public.search_semantic(vector, text, text, int, real) from public;
grant execute on function public.search_semantic(vector, text, text, int, real) to authenticated;
