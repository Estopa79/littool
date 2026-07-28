-- Phase 6, eingeschobenes Paket F: Fixes & Feinschliff.

-- 1) Funktions-Chips am Abschnitt (analog section_topics/section_research_questions,
-- Migration 0032) - Funktion-Dimension selbst existiert bereits seit Migration 0023
-- (work_functions/source_functions), hier nur die Section-Verknuepfung dazu.
create table public.section_functions (
  section_id uuid not null references public.sections(id) on delete cascade,
  function_id uuid not null references public.work_functions(id) on delete cascade,
  primary key (section_id, function_id)
);

create index section_functions_function_idx on public.section_functions (function_id);

alter table public.section_functions enable row level security;
create policy "section_functions_authenticated_all"
  on public.section_functions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.section_functions to authenticated;

-- 2) Ranking-Matching bei Venue-Aenderung: "sofort" bedeutet hier bewusst kein
-- Live-Match (dafuer muessten die Ranking-CSVs in die DB dupliziert werden -
-- mit dem Autor abgestimmt, siehe Chat-Rueckfrage), sondern ein sauberes
-- Zuruecksetzen automatisch gesetzter Rankings bei jeder Venue-Aenderung,
-- egal von welchem Client geschrieben (Frontend-Korrektur-Dialog, Worker-
-- BibTeX-Import, graue-Literatur-Erfassung) - der naechste
-- `littool-worker match-ranking`-Lauf zieht die zurueckgesetzten Quellen dann
-- nach. Handisch gesetzte Rankings (ranking_manual = true) werden nie
-- automatisch angefasst.
alter table public.sources add column ranking_manual boolean not null default false;

create or replace function public.reset_ranking_on_venue_change()
returns trigger
language plpgsql
as $$
begin
  if new.venue is distinct from old.venue and not new.ranking_manual then
    new.ranking_system := null;
    new.ranking_value := null;
  end if;
  return new;
end;
$$;

create trigger sources_reset_ranking_on_venue_change
  before update on public.sources
  for each row execute function public.reset_ranking_on_venue_change();

-- 3) Themenfelder sortierbar: gleiches Feld/Prinzip wie research_questions.sort_order
-- (Migration 0014). Backfill nach aktueller alphabetischer Reihenfolge, damit sich
-- fuer bestehende Themenfelder beim Rollout nichts sichtbar verschiebt.
alter table public.topics add column sort_order integer;

with ordered as (
  select id, row_number() over (order by name) - 1 as rn
  from public.topics
)
update public.topics t set sort_order = ordered.rn
from ordered
where ordered.id = t.id;

alter table public.topics alter column sort_order set not null;
alter table public.topics alter column sort_order set default 0;
