-- Phase 3, Paket 11: Evaluationsmatrix - Kriterien & KI-Vorbewertung
--
-- Frei definierbare Kriterien-Sets (Konzept Abschnitt 5): ein Set fasst
-- mehrere Kriterien zusammen, jede Quelle wird je Kriterium mit 0/1/2
-- (nicht/teilweise/voll) bewertet - KI-vorbewertet, im QS-Workflow
-- bestaetigbar/korrigierbar, gleiches confirmed-Prinzip wie ueberall sonst.

create table public.criterion_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.criterion_sets(id) on delete cascade,
  name text not null,
  short_name text not null,
  sort_order integer not null,
  derivation text, -- Herleitung: woraus sich das Kriterium ableitet (KI-Vorschlag oder manuell)
  created_at timestamptz not null default now()
);

create index criteria_set_idx on public.criteria (set_id);

create table public.source_criteria (
  source_id uuid not null references public.sources(id) on delete cascade,
  criterion_id uuid not null references public.criteria(id) on delete cascade,
  value integer not null check (value in (0, 1, 2)), -- 0=nicht, 1=teilweise, 2=voll
  reasoning text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (source_id, criterion_id)
);

create index source_criteria_criterion_idx on public.source_criteria (criterion_id);

alter table public.criterion_sets enable row level security;
create policy "criterion_sets_authenticated_all"
  on public.criterion_sets for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.criterion_sets to authenticated;

alter table public.criteria enable row level security;
create policy "criteria_authenticated_all"
  on public.criteria for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.criteria to authenticated;

alter table public.source_criteria enable row level security;
create policy "source_criteria_authenticated_all"
  on public.source_criteria for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.source_criteria to authenticated;

-- Startdaten: das reale 8-Kriterien-Set der Forschungsluecken-Matrix
-- (docs/Evaluationsmatrix_Interaktiv.html, Referenz-Design). Kurznamen aus
-- CRIT_LABELS der Vorlage, Reihenfolge = Spaltenreihenfolge dort.
insert into public.criterion_sets (id, name, description) values
  ('a1c11111-0000-4000-8000-000000000001', 'Forschungslücke BITA', 'Acht Kriterien der Forschungslücken-Matrix (Schnittmengen Business-IT Alignment, Digitale Transformation, deutsche Sachversicherung).');

insert into public.criteria (set_id, name, short_name, sort_order) values
  ('a1c11111-0000-4000-8000-000000000001', 'BITA-Konstrukt', 'BITA-Konstrukt', 1),
  ('a1c11111-0000-4000-8000-000000000001', 'Dynamic Capabilities', 'Dynamic Capabilities', 2),
  ('a1c11111-0000-4000-8000-000000000001', 'Social Alignment', 'Social Alignment', 3),
  ('a1c11111-0000-4000-8000-000000000001', 'Digitale Transformation als abhängige Variable', 'DT als AV', 4),
  ('a1c11111-0000-4000-8000-000000000001', 'Deutsche Sach-/Unfallversicherung', 'Dt. P&C-Versicherung', 5),
  ('a1c11111-0000-4000-8000-000000000001', 'Regulatorik (DORA/VAIT)', 'Regulatorik DORA/VAIT', 6),
  ('a1c11111-0000-4000-8000-000000000001', 'Empirische Methodik', 'Empirische Methodik', 7),
  ('a1c11111-0000-4000-8000-000000000001', 'Operationalisierung/Survey', 'Operationalisierung/Survey', 8);
