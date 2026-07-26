-- Phase 2, Paket 7: Hybrid-Ranking
--
-- Kombiniert Volltext- (Migration 0009) und semantische Suche (Migration
-- 0010/0011) per Reciprocal Rank Fusion (RRF): für jede der beiden
-- Trefferlisten wird eine Rangposition ermittelt, der RRF-Score einer Zeile
-- ist 1/(k + rang) mit k=60 (Standardwert aus der RRF-Literatur, dämpft den
-- Einfluss der exakten Randposition). Ein Chunk, der in beiden Listen
-- auftaucht, bekommt die Summe beider Scores - taucht er nur in einer Liste
-- auf, zählt nur deren Score. So gewinnen Treffer, die aus beiden
-- Perspektiven (Wortlaut UND Bedeutung) relevant sind, ohne dass eine Suche
-- die andere komplett verdrängt.
--
-- search_mode steuert, welche der beiden Listen einfließen:
--   'hybrid'   (Standard) - beide, per RRF kombiniert
--   'fulltext' - nur Volltextsuche
--   'semantic' - nur semantische Suche
-- Damit Aufrufer im "nur Volltext"-Modus keine Embedding-Berechnung braucht
-- und umgekehrt, sind search_query und query_embedding beide nullable -
-- welcher Teil tatsächlich gebraucht wird, hängt vom Modus ab.
--
-- Kandidatenlisten sind pro Zweig auf greatest(match_limit*3, 50) begrenzt,
-- bevor fusioniert wird - genug Überlappungspotenzial für die RRF-Summe,
-- ohne die kompletten 18k+ Chunks pro Zweig zu materialisieren.
--
-- "rank" ist hier der RRF-Score (keine feste Skala, nur für die Sortierung
-- innerhalb eines Aufrufs gedacht) - anders als bei search_fulltext (ts_rank)
-- und search_semantic (Cosine-Ähnlichkeit), aber gleiche Spaltenstruktur wie
-- beide, wie in Paket 5/6 vorgesehen.

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
        'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=1'
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
    -- bei Überlappung bevorzugt die Version mit dem höheren Einzel-Score
    -- (meist die mit <mark>-Hervorhebung aus der Volltextsuche)
    (array_agg(snippet order by rrf_score desc))[1] as snippet,
    sum(rrf_score)::real as rank
  from combined
  group by chunk_id, source_id, title, authors, year, venue, type, ranking_system, ranking_value, page
  order by rank desc
  limit match_limit;
$$;

revoke all on function public.search_hybrid(text, vector, text, text, int, text) from public;
grant execute on function public.search_hybrid(text, vector, text, text, int, text) to authenticated;
