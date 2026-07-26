-- Phase 3, eingeschobenes Paket F: Funktion-Dimension
--
-- Nicht jede Quelle zahlt auf ein Themenfeld ein (z. B. reine Methodik-
-- Literatur) - trotzdem soll sie nicht als "nicht eingeordnet" auffallen und
-- keine Schnittmengen/Evaluationsmatrix verschmutzen. Eigene, von Themenfeld
-- unabhaengige Dimension: die Funktion der Quelle in der Arbeit.

create table public.work_functions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.source_functions (
  source_id uuid not null references public.sources(id) on delete cascade,
  function_id uuid not null references public.work_functions(id) on delete cascade,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (source_id, function_id)
);

create index source_functions_function_idx on public.source_functions (function_id);

insert into public.work_functions (name) values
  ('Themenfeld-Literatur'),
  ('Einleitung/Problemstellung'),
  ('Methodik');

alter table public.work_functions enable row level security;
create policy "work_functions_authenticated_all"
  on public.work_functions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.work_functions to authenticated;

alter table public.source_functions enable row level security;
create policy "source_functions_authenticated_all"
  on public.source_functions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.source_functions to authenticated;
