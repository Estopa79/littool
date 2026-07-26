-- Phase 3, Paket K (Fix zu 0020): unzuverlaessige Seiten-Offsets zuruecksetzen
--
-- Stichprobe nach 0020 ergab: der automatische Offset-Abgleich verglich nur
-- den "pages"-Bereich aus Crossref, ohne zu pruefen, ob die tatsaechliche
-- PDF-Seitenzahl dazu passt. 6 Quellen weichen ab - meist, weil das
-- hinterlegte PDF ein Preprint/Repository-Exemplar mit eigener Paginierung
-- ist (z. B. ResearchGate-Kopie: 20 PDF-Seiten statt der 9 Journal-Seiten
-- 123-131), nicht die final gesetzte Verlagsversion. Der abgeleitete Offset
-- waere fuer diese Quellen falsch - zurueck auf 0 und sichtbar markieren statt
-- eine unzuverlaessige Zahl stehen zu lassen. Der Zitations-Trigger aus 0019/
-- 0020 korrigiert die schon erzeugten Passagen-Zitationen dieser Quellen
-- automatisch mit, sobald page_offset hier auf 0 gesetzt wird.

update public.sources
set page_offset = 0,
    status = 'needs_review',
    status_hint = coalesce(status_hint || ' / ', '')
      || 'Seiten-Offset unsicher: PDF-Seitenzahl passt nicht zum Crossref-Seitenbereich '
      || '(vermutlich Preprint/Repository-Exemplar statt Verlags-PDF) - bitte manuell pruefen'
where id in (
  '54721a19-30cb-424f-a881-b59433575a72', -- 9 erwartet, 20 PDF-Seiten (ResearchGate-Kopie)
  'cdf1691c-56e5-46d7-a7e8-8f91be1c45a3', -- 13 erwartet, 17 PDF-Seiten
  'c01e64e3-ac93-4647-ab13-a110d0dbb76a', -- 16 erwartet, 27 PDF-Seiten
  '321ee7e3-6dfd-4b75-aa14-d8fc1eb0a50d', -- 18 erwartet, 19 PDF-Seiten
  'b7baac96-23bc-408d-882e-972749a7f3d9', -- 12 erwartet, 11 PDF-Seiten
  '021e9f7f-65b8-448e-b758-54e5d29d7b32'  -- 10 erwartet, 11 PDF-Seiten
);
