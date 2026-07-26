-- Phase 2, Paket 8: Sichere Hervorhebungs-Markierung in Snippets.
--
-- search_fulltext (0009) und search_hybrid (0012) liessen ts_headline
-- literale <mark>/</mark>-Tags in den Snippet-Text einfügen. Das Frontend
-- muss Snippets aber über dangerouslySetInnerHTML rendern, um die
-- Hervorhebung darzustellen - würde ein PDF zufällig "<" oder ">" im
-- extrahierten Text enthalten, würde das als echtes HTML interpretiert statt
-- als Text angezeigt (XSS-Lücke, auch wenn bei den eigenen PDFs dieser
-- Arbeit unwahrscheinlich).
--
-- Fix: ts_headline markiert Treffer jetzt mit zwei Private-Use-Area-Zeichen
-- (U+E000/U+E001) statt mit "<mark>"/"</mark>" - Zeichen, die in echtem Text
-- praktisch nie vorkommen. Das Frontend escaped den kompletten Snippet-Text
-- zuerst regulär für HTML und ersetzt erst danach genau diese beiden
-- Sentinel-Zeichen durch echte <mark>/</mark>-Tags - jeder zufällig im
-- Original enthaltene "<"/">" bleibt dabei sicher als Text erhalten.

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
      'StartSel=' || chr(57344) || ', StopSel=' || chr(57345) || ', MaxWords=60, MinWords=20, MaxFragments=1'
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

create or replace function public.search_hybrid(
  search_query text default null,
  query_embedding vector(1024) default null,
  filter_ranking_system text default null,
  filter_type text default null,
  match_limit int default 20,
  search_mode text default 'hybrid'
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
  with fulltext_hits as (
    select
      c.id as chunk_id,
      s.id as source_id,
      s.title, s.authors, s.year, s.venue, s.type, s.ranking_system, s.ranking_value,
      c.page,
      ts_headline(
        'german',
        c.text,
        websearch_to_tsquery('german', search_query) || websearch_to_tsquery('english', search_query),
        'StartSel=' || chr(57344) || ', StopSel=' || chr(57345) || ', MaxWords=60, MinWords=20, MaxFragments=1'
      ) as snippet,
      row_number() over (
        order by ts_rank(
          c.fts,
          websearch_to_tsquery('german', search_query) || websearch_to_tsquery('english', search_query)
        ) desc
      ) as rnk
    from public.chunks c
    join public.sources s on s.id = c.source_id
    where search_mode in ('hybrid', 'fulltext')
      and search_query is not null and search_query <> ''
      and c.fts @@ (
        websearch_to_tsquery('german', search_query) || websearch_to_tsquery('english', search_query)
      )
      and (filter_ranking_system is null or s.ranking_system = filter_ranking_system)
      and (filter_type is null or s.type = filter_type)
    order by rnk
    limit greatest(match_limit * 3, 50)
  ),
  semantic_hits as (
    select
      c.id as chunk_id,
      s.id as source_id,
      s.title, s.authors, s.year, s.venue, s.type, s.ranking_system, s.ranking_value,
      c.page,
      c.text as snippet,
      row_number() over (order by c.embedding <=> query_embedding) as rnk
    from public.chunks c
    join public.sources s on s.id = c.source_id
    where search_mode in ('hybrid', 'semantic')
      and query_embedding is not null
      and c.embedding is not null
      and (filter_ranking_system is null or s.ranking_system = filter_ranking_system)
      and (filter_type is null or s.type = filter_type)
    order by c.embedding <=> query_embedding
    limit greatest(match_limit * 3, 50)
  ),
  combined as (
    select chunk_id, source_id, title, authors, year, venue, type, ranking_system, ranking_value,
           page, snippet, 1.0 / (60 + rnk) as rrf_score
    from fulltext_hits
    union all
    select chunk_id, source_id, title, authors, year, venue, type, ranking_system, ranking_value,
           page, snippet, 1.0 / (60 + rnk) as rrf_score
    from semantic_hits
  )
  select
    chunk_id, source_id, title, authors, year, venue, type, ranking_system, ranking_value, page,
    (array_agg(snippet order by rrf_score desc))[1] as snippet,
    sum(rrf_score)::real as rank
  from combined
  group by chunk_id, source_id, title, authors, year, venue, type, ranking_system, ranking_value, page
  order by rank desc
  limit match_limit;
$$;
