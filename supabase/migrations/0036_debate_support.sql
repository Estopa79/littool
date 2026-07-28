-- Phase 5, Paket 7: Schema-Ergaenzungen fuer die Mehr-Runden-Debatte.
--
-- `discussion_entries.author_type` bekommt einen dritten Wert 'system' fuer
-- die automatisch erzeugte Abschluss-Zusammenfassung ("Kernpunkte der
-- Debatte", Arbeitsplan) - das ist weder eine Persona-Meinung noch ein
-- Autoren-Kommentar, sondern eine neutrale Synthese. persona_id bleibt dabei
-- null (gleiche Regel wie bisher bei 'user'). Beide betroffenen
-- Check-Constraints (Spalten-Check + der zusammengesetzte Tabellen-Check aus
-- Migration 0032) werden dynamisch ueber pg_constraint gefunden statt
-- geraten, da kein lokaler DB-Zugriff (Docker) besteht.
--
-- `jobs.status` bekommt 'cancelled' fuer "jederzeit abbrechbar" - der
-- Hintergrund-Job prueft vor jeder neuen Debatten-Runde, ob der Status
-- zwischenzeitlich vom Frontend auf 'cancelled' gesetzt wurde, und bricht
-- dann kontrolliert ab (inkl. Abschluss-Zusammenfassung dessen, was bis
-- dahin besprochen wurde).
--
-- `ai_log_entries.action_type` bekommt 'debatte' (eine Debatte = ein
-- AiLog-Eintrag mit den Gesamtkosten aller Runden + Zusammenfassung, nicht
-- ein Eintrag pro Redebeitrag - sonst waere das Verzeichnis bei einer
-- 3x3-Debatte mit zehn Eintraegen fuer eine einzige Nutzeraktion ueberladen).

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.discussion_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%author_type%'
  loop
    execute format('alter table public.discussion_entries drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.discussion_entries
  add constraint discussion_entries_author_type_check
  check (author_type in ('persona', 'user', 'system'));

alter table public.discussion_entries
  add constraint discussion_entries_author_persona_check
  check (
    (author_type = 'persona' and persona_id is not null)
    or (author_type in ('user', 'system') and persona_id is null)
  );

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.jobs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%pending%';

  if con_name is not null then
    execute format('alter table public.jobs drop constraint %I', con_name);
  end if;
end $$;

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('pending', 'running', 'done', 'failed', 'cancelled'));

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
    'entwurf', 'reaktion', 'textpruefung', 'debatte'
  ));
