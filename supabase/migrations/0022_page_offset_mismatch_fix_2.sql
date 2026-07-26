-- Phase 3, Paket K (2. Nachbesserung zu 0020/0021): weitere unzuverlaessige
-- Seiten-Offsets zuruecksetzen
--
-- 0021 verglich nur die PDF-Gesamtseitenzahl gegen den erwarteten Crossref-
-- Bereich. Das reicht nicht: manche Preprints haben zufaellig dieselbe
-- Seitenzahl wie die Verlagsversion, nummerieren aber ab 1 statt beim
-- Journal-Startwert (z. B. "Business and Information Technology Alignment
-- Measurement" - 12 PDF-Seiten wie erwartet, aber eigene 1-12-Paginierung
-- statt 112-123). Nachtraeglich per Stichproben-Check verifiziert, ob die
-- erwartete Zitationsseite tatsaechlich auf einer Beispielseite aufgedruckt
-- steht (siehe worker/littool_worker/fulltext.py:_compute_page_offset) -
-- 3 weitere Treffer gefunden.

update public.sources
set page_offset = 0,
    status = 'needs_review',
    status_hint = coalesce(status_hint || ' / ', '')
      || 'Seiten-Offset unsicher: PDF entspricht nicht dem Crossref-Seitenbereich '
      || '(vermutlich Preprint/Repository-Exemplar statt Verlags-PDF) - bitte manuell pruefen'
where id in (
  'a3ca8136-fe5f-47c8-b8e9-76dd9846636d', -- 231-245 erwartet, eigene Paginierung
  '1b373e8d-293c-4a84-85b4-297827e6f83e', -- 112-123 erwartet, eigene 1-12-Paginierung (Preprint)
  'e563ffca-5621-40a1-a10e-a8145f270c48'  -- 205-241 erwartet, eigene Paginierung
);
