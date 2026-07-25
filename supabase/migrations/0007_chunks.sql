-- Phase 2, Paket 1: Schema Chunks & Suchinfrastruktur
--
-- Embedding-Dimension 1024 = Voyage AI voyage-3.5 (Entscheidung im Chat,
-- vom eigentlich erst vor Paket 4 geplanten Zeitpunkt vorgezogen, weil die
-- Vektor-Spalte hier schon eine feste Dimension braucht).
--
-- FTS-Konfiguration: kombiniertes tsvector aus 'german' + 'english' statt
-- 'simple' + unaccent. Begründung: der Bestand ist nicht pro Zeile nach
-- Sprache getaggt (Chunks sind mal deutsch, mal englisch), daher keine
-- verlässliche Grundlage für eine automatische Sprachwahl pro Zeile.
-- 'simple'+unaccent wäre sprachneutral, verliert aber jede Stemming-Leistung
-- (kein Treffer für "alignment" bei Suche nach "aligned", kein Treffer für
-- deutsche Kompositum-/Flexionsformen). Die Kombination beider Konfigurationen
-- verdoppelt zwar die Tokenmenge pro Chunk, liefert aber für beide Sprachen
-- brauchbares Stemming - bei unserer Bestandsgröße (~150 Quellen) ist der
-- Mehraufwand an Indexgröße vernachlässigbar gegenüber dem Recall-Gewinn.

create extension if not exists vector;

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  page integer not null,
  chunk_index integer not null,
  text text not null,
  embedding vector(1024),
  fts tsvector generated always as (
    to_tsvector('german', coalesce(text, '')) || to_tsvector('english', coalesce(text, ''))
  ) stored,
  created_at timestamptz not null default now()
);

create unique index chunks_source_chunk_idx on public.chunks (source_id, chunk_index);
create index chunks_fts_idx on public.chunks using gin (fts);
create index chunks_embedding_idx on public.chunks using hnsw (embedding vector_cosine_ops);

alter table public.chunks enable row level security;

create policy "chunks_authenticated_all"
  on public.chunks
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.chunks to authenticated;
