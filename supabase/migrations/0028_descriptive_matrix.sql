-- Eingeschobenes Paket vor der Evaluationsmatrix (Paket 11/12): Deskriptions-
-- matrix - Vorstufe zur Kriterien-Bewertung. Reine Synthese-Uebersicht je
-- Quelle (Autor/Jahr, Einordnung, Theoretische Fundierung, Stichprobe,
-- Analysemethode, wesentliche Erkenntnisse), von Hand befuellbar oder per
-- KI-Button vorgeschlagen. `included` steuert, welche Quellen tatsaechlich
-- in die Matrix aufgenommen werden (Checkbox in der Ansicht).

create table public.descriptive_matrix_entries (
  source_id uuid primary key references public.sources(id) on delete cascade,
  included boolean not null default false,
  einordnung text,
  theoretische_fundierung text,
  stichprobe text,
  analysemethode text,
  erkenntnisse text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.descriptive_matrix_entries enable row level security;
create policy "descriptive_matrix_entries_authenticated_all"
  on public.descriptive_matrix_entries for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.descriptive_matrix_entries to authenticated;
