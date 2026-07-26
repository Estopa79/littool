-- Phase 3, Paket 3: Analyse-Status je Quelle
--
-- Eigener Status fuer die Themen-/Relevanz-Analyse, unabhaengig vom Ingest-
-- Status (Phase 1) und vom extraction_status (Phase 2) - genau das gleiche
-- Muster wie 0008_extraction_status.sql. NULL = noch nicht analysiert (Filter
-- fuer den Batch-Lauf/Wiederaufnahme), 'complete'/'failed' danach.

alter table public.sources
  add column analysis_status text
    check (analysis_status in ('complete', 'failed')),
  add column analysis_hint text;
