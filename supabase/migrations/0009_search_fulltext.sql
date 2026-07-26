-- Phase 2, Paket 5: Volltextsuche (Backend)
--
-- websearch-Syntax (Anführungszeichen für Phrasen, "-" zum Ausschließen, OR),
-- kombiniert deutsch+englisch wie schon beim tsvector in Migration 0007.
-- Treffer mit Quellen-Metadaten, Seite, hervorgehobenem Snippet (ts_headline)
-- und Relevanz-Rang.
--
-- Filter Themenfeld und Studientyp sind laut Plan vorgesehen, aber noch nicht
-- baubar: Topics/SourceTopic (Themenfeld) und die Methodenprofil-Felder
-- (Studientyp) existieren erst ab Phase 3 - siehe Notizen in
-- arbeitsplan-phase-1.md (Paket 2) und arbeitsplan-phase-2.md (Paket 0).
-- Nur Ranking und Quellentyp sind aktuell filterbar.

create or replace function public.search_fulltext(
  search_query text,
  filter_ranking_system text default null,
  filter_type text default null,
  match_limit int default 20
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
    ts_headline(
      'german',
      c.text,
      websearch_to_tsquery('german', search_query) || websearch_to_tsquery('english', search_query),
      'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=1'
    ) as snippet,
    ts_rank(
      c.fts,
      websearch_to_tsquery('german', search_query) || websearch_to_tsquery('english', search_query)
    ) as rank
  from public.chunks c
  join public.sources s on s.id = c.source_id
  where c.fts @@ (
      websearch_to_tsquery('german', search_query) || websearch_to_tsquery('english', search_query)
    )
    and (filter_ranking_system is null or s.ranking_system = filter_ranking_system)
    and (filter_type is null or s.type = filter_type)
  order by rank desc
  limit match_limit;
$$;

revoke all on function public.search_fulltext(text, text, text, int) from public;
grant execute on function public.search_fulltext(text, text, text, int) to authenticated;
