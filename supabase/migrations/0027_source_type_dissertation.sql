-- Neuer Quellentyp "Doktorarbeit/wissenschaftliche Arbeit" (Nutzer-Feedback
-- beim Review: Dissertationen/Abschlussarbeiten passen weder zu "buch" noch
-- zu "journal"/"konferenz"/"grau").

alter table public.sources
  drop constraint sources_type_check;

alter table public.sources
  add constraint sources_type_check
  check (type in ('journal', 'konferenz', 'buch', 'grau', 'dissertation'));
