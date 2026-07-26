-- Phase 2, Paket 6: Semantische Suche (Backend)
--
-- Nimmt ein bereits berechnetes Query-Embedding entgegen (Voyage AI,
-- input_type="query" - das Embedding selbst passiert außerhalb von Postgres,
-- siehe worker/littool_worker/embeddings.py:embed_query) und liefert die
-- inhaltlich ähnlichsten Chunks per Cosine-Distanz aus dem HNSW-Index
-- (Migration 0007, vector_cosine_ops).
--
-- Gleiche Rückgabestruktur wie public.search_fulltext (Migration 0009), damit
-- beide Suchen in Paket 7 (Hybrid-Ranking) zusammengeführt werden können.
-- "rank" ist hier die Cosine-Ähnlichkeit (1 - Distanz, 1 = identisch), nicht
-- ts_rank. "snippet" ist der volle Chunk-Text ohne Hervorhebung, da es keine
-- Suchbegriffe zum Markieren gibt.
--
-- Filter Themenfeld/Studientyp wie in Migration 0009 noch nicht baubar (Schema
-- erst ab Phase 3).

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
    and (match_threshold is null or (1 - (c.embedding <=> query_embedding)) >= match_threshold)
  order by c.embedding <=> query_embedding
  limit match_limit;
$$;

revoke all on function public.search_semantic(vector, text, text, int, real) from public;
grant execute on function public.search_semantic(vector, text, text, int, real) to authenticated;
