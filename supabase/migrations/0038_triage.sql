-- Phase 5, Paket E: Eingangspruefung / Pruef-Pool
--
-- Neuer Quellen-Status 'triage': Upload in den "Eingang"-Tab legt nur PDF +
-- Dateiname an, OHNE Voll-Verarbeitung (keine Metadaten-Anreicherung, kein
-- Chunking, keine Embeddings). Die bestehenden Worker-Schritte (extract-doi,
-- enrich-metadata, extract-fulltext, chunk, embed, ...) filtern durchweg
-- exakt auf status='processing' - triage-Quellen werden von ihnen automatisch
-- NICHT angefasst, ohne dass eine dieser Stellen geaendert werden muss.
-- "Uebernehmen" wechselt den Status auf 'processing', danach laeuft die
-- bestehende Phase-1-Pipeline unveraendert an.
--
-- file_hash (SHA-256, hex, clientseitig per Web Crypto berechnet) wird bei
-- JEDEM Upload gesetzt (Eingang UND Direkt-Upload, s. lib/uploadSource.ts) -
-- Grundlage fuer die Wiedererkennung gegen die Verworfen-Liste.
--
-- triage_recommendation/triage_reasoning/triage_assessed_at: Ergebnis der
-- Schnell-Einschaetzung, erzeugt vom neuen Worker-Befehl `triage-assess`
-- (worker/littool_worker/triage.py) - bewusst ein Worker-Befehl statt einer
-- Edge Function, da er PDF-Rohtext braucht, den bislang ausschliesslich
-- PyMuPDF im Worker liefert.
--
-- triage_rejections: eigene, bewusst schlanke Tabelle statt Wiederverwendung
-- von `sources` fuer verworfene Kandidaten - nur die im Plan geforderten
-- Merkfelder (Titel/Dateiname/DOI/Hash/Datum/Begruendung), entkoppelt von der
-- vollen Quellen-Struktur und ueberlebt unabhaengig von der beim Verwerfen
-- geloeschten sources-Zeile (inkl. ihres per Migration 0026 kaskadierend
-- geloeschten AiLog-Eintrags - konsistent mit der dortigen Begruendung:
-- Log-Eintraege ueber eine geloeschte Quelle sind bedeutungslos).

-- Anker bewusst 'needs_review' statt 'status' - die Spalte heisst zwar
-- eindeutig "status", aber sources hat noch zwei weitere Check-Constraints
-- deren Spaltennamen ('extraction_status', 'analysis_status') die Teilzeichenkette
-- "status" ebenfalls enthalten (erster Versuch traf dadurch die falsche
-- Constraint und schlug fehl - Wert 'needs_review' kommt nur im eigentlichen
-- Status-Constraint vor).
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.sources'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%needs_review%';

  if con_name is not null then
    execute format('alter table public.sources drop constraint %I', con_name);
  end if;
end $$;

alter table public.sources
  add constraint sources_status_check
  check (status in ('processing', 'needs_review', 'complete', 'failed', 'triage'));

alter table public.sources
  add column file_hash text,
  add column triage_recommendation text
    check (triage_recommendation in ('aufnehmen', 'grenzwertig', 'verwerfen')),
  add column triage_reasoning jsonb,
  add column triage_assessed_at timestamptz;

create index sources_file_hash_idx on public.sources (file_hash) where file_hash is not null;

create table public.triage_rejections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  doi text,
  file_hash text not null,
  reason text not null,
  rejected_at timestamptz not null default now()
);

create index triage_rejections_file_hash_idx on public.triage_rejections (file_hash);

alter table public.sources
  add column duplicate_of_rejection_id uuid
    references public.triage_rejections(id) on delete set null;

alter table public.triage_rejections enable row level security;
create policy "triage_rejections_authenticated_all"
  on public.triage_rejections
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public.triage_rejections to authenticated;

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
    'entwurf', 'reaktion', 'textpruefung', 'debatte', 'chat', 'triage'
  ));
