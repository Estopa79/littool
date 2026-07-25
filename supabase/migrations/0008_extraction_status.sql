-- Phase 2, Paket 2: Volltextextraktion (Worker)
-- Eigener Status für die Extraktions-Pipeline, unabhängig vom bestehenden
-- Ingest-Status (processing/needs_review/complete/failed) aus Phase 1 - eine
-- Quelle kann z. B. Metadaten-mäßig "complete" sein und trotzdem noch keine
-- Volltextextraktion durchlaufen haben.

alter table public.sources
  add column extraction_status text
    check (extraction_status in ('extracted', 'ocr_done', 'extraction_failed')),
  add column extraction_hint text;
