-- Fix: ai_log_entries.source_id war "on delete set null", kollidiert aber mit
-- dem Check-Constraint "source_id is not null or passage_id is not null" -
-- jede Loeschung einer Quelle mit einem reinen quellenbezogenen Log-Eintrag
-- (Analyse, Methodenprofil, Funktion - passage_id dort immer null) schlug
-- fehl. Aufgedeckt beim Bestandsbereinigen (55 Quellen entfernt).
--
-- Log-Eintraege ueber eine geloeschte Quelle sind ohnehin bedeutungslos (das
-- KI-Verzeichnis dokumentiert KI-Nutzung an der tatsaechlich verwendeten
-- Quelle, nicht an entfernten/Duplikat-Dokumenten) - deshalb cascade statt
-- set null, konsistent mit allen anderen Tabellen, die an sources haengen.

alter table public.ai_log_entries
  drop constraint ai_log_entries_source_id_fkey;

alter table public.ai_log_entries
  add constraint ai_log_entries_source_id_fkey
  foreign key (source_id) references public.sources(id) on delete cascade;
