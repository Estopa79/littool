-- Phase 5, Paket 6: zwei neue KI-Aktionstypen fuer die Diskussion.
--
-- 'reaktion' = eine einzelne Persona-Reaktion im Diskussionsfaden zu einer
-- Entwurfsversion. 'textpruefung' = "Eigenen Text pruefen" (legt selbst eine
-- neue Entwurfsversion mit created_by='author' an und laesst eine Persona
-- sie beurteilen). Gleiches Muster wie Migration 0034 (Constraint-Name
-- dynamisch ermitteln statt raten, kein lokaler DB-Zugriff/Docker).

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.ai_log_entries'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action_type%';

  if con_name is not null then
    execute format('alter table public.ai_log_entries drop constraint %I', con_name);
  end if;
end $$;

alter table public.ai_log_entries
  add constraint ai_log_entries_action_type_check
  check (action_type in (
    'analyse', 'uebersetzung', 'passagen_extraktion', 'methodenprofil', 'paraphrase',
    'entwurf', 'reaktion', 'textpruefung'
  ));
