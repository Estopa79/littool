-- Phase 5, Paket 9: neuer KI-Aktionstyp 'chat' fuer den freien, belegten Chat
-- ueber den Bestand - ein AiLog-Eintrag je Chat-Anfrage (RAG-Retrieval +
-- Claude-Antwort). Gleiches dynamisches Constraint-Ermitteln wie in den
-- Migrationen 0034-0036 (kein lokaler DB-Zugriff/Docker).

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
    'entwurf', 'reaktion', 'textpruefung', 'debatte', 'chat'
  ));
