-- Phase 6 (ad-hoc, Autorenwunsch 2026-07-29): Themenfeld/Funktion direkt am
-- einzelnen Zitat/Textabschnitt statt nur an der Quelle. Bisher hing ein
-- Textabschnitt (`passages`) nur an einer Forschungsfrage; Themenfeld und
-- Funktion waren nur an der Quelle (`source_topics`/`source_functions`)
-- gepflegt - fuer den Zitat-Pool-Filter der Schreibwerkstatt reichte das
-- nicht mehr aus, sobald einzelne Abschnitte einer Quelle zu
-- unterschiedlichen Themen/Funktionen gehoeren.
--
-- Gleiches Verknuepfungs-Muster wie section_topics/section_functions
-- (Migration 0032/0039) - direkte, vom Autor gesetzte Verknuepfung, daher
-- kein "confirmed"-Feld (anders als source_topics/source_functions, die
-- KI-Vorschlaege sind und erst bestaetigt werden muessen).

create table public.passage_topics (
  passage_id uuid not null references public.passages(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  primary key (passage_id, topic_id)
);

create index passage_topics_topic_idx on public.passage_topics (topic_id);

alter table public.passage_topics enable row level security;
create policy "passage_topics_authenticated_all"
  on public.passage_topics for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.passage_topics to authenticated;

create table public.passage_functions (
  passage_id uuid not null references public.passages(id) on delete cascade,
  function_id uuid not null references public.work_functions(id) on delete cascade,
  primary key (passage_id, function_id)
);

create index passage_functions_function_idx on public.passage_functions (function_id);

alter table public.passage_functions enable row level security;
create policy "passage_functions_authenticated_all"
  on public.passage_functions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.passage_functions to authenticated;
