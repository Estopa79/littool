-- Paket 2: Schema Quellen
-- Felder gemäß Konzept Abschnitt 5, begrenzt auf Phase-1-Scope (Ingest &
-- Metadaten). Methodenprofil-Felder (studientyp, methode, sample,
-- auswertung) folgen erst mit Modul 3/Phase 3 in einer eigenen Migration.

create table public.sources (
  id uuid primary key default gen_random_uuid(),

  -- Kernangaben
  type text not null check (type in ('journal', 'konferenz', 'buch', 'grau')),
  title text not null,
  authors jsonb, -- Array von {"family": "...", "given": "..."}, Reihenfolge = Autorenreihenfolge
  year integer,

  -- Venue/Publikation (bei type='grau': Herausgeber/Institution)
  venue text,
  volume text, -- Band
  issue text, -- Heft
  pages text, -- Seiten der Publikation (z. B. "123-145"), nicht zu verwechseln mit Chunk/Passage.seite
  issn text, -- für Ranking-Matching (Paket 6)
  doi text,

  -- Anreicherung
  abstract text,
  citation_count integer,
  url text, -- bei type='grau': Quelle ohne DOI (z. B. BaFin-Merkblatt-Link)

  -- Ranking (Herkunft + Ergebnis); beide null = "kein Ranking gefunden"
  -- (bzw. bei type='grau' in der UI als "nicht anwendbar" dargestellt)
  ranking_system text check (ranking_system in ('VHB', 'SJR', 'CORE')),
  ranking_value text,

  -- Datei & Status
  storage_path text, -- Pfad im Bucket "pdfs"
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'complete', 'failed')),
  status_hint text, -- Klartext-Grund, z. B. "keine DOI gefunden", "OCR nötig", "Crossref leer"

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verhindert doppelte Quellen über dieselbe DOI (Dublettenerkennung Paket 10
-- greift zusätzlich auf Titel-Ähnlichkeit zurück, das hier ist nur der klare Fall).
create unique index sources_doi_unique on public.sources (doi) where doi is not null;

create index sources_status_idx on public.sources (status);
create index sources_type_idx on public.sources (type);

alter table public.sources enable row level security;

create policy "sources_authenticated_all"
  on public.sources
  for all
  to authenticated
  using (true)
  with check (true);
