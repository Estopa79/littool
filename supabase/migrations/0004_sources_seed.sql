-- Paket 2: Testquellen (Fixtures, keine echten Bestandsdaten)
-- Deckt die drei Kernfälle ab: vollständig, needs_review (fehlende DOI),
-- graue Literatur ohne Ranking.

insert into public.sources
  (type, title, authors, year, venue, volume, issue, pages, issn, doi, ranking_system, ranking_value, status)
values
  (
    'journal',
    'Explicating Dynamic Capabilities: The Nature and Microfoundations of (Sustainable) Enterprise Performance',
    '[{"family": "Teece", "given": "David J."}]'::jsonb,
    2007,
    'Strategic Management Journal',
    '28',
    '13',
    '1319-1350',
    '0143-2095',
    '10.1002/smj.640',
    'VHB',
    'A',
    'complete'
  );

insert into public.sources
  (type, title, authors, year, venue, status, status_hint)
values
  (
    'journal',
    'How Social Capital Among Information Technology and Business Units Drives Operational Alignment and IT Business Value',
    '[{"family": "Wagner", "given": "Heinz-Theo"}, {"family": "Beimborn", "given": "Daniel"}, {"family": "Weitzel", "given": "Tim"}]'::jsonb,
    2014,
    'Journal of Management Information Systems',
    'needs_review',
    'keine DOI gefunden'
  );

insert into public.sources
  (type, title, authors, year, venue, url, status)
values
  (
    'grau',
    'Merkblatt zur Auslagerung von Versicherungsunternehmen',
    '[{"family": "BaFin", "given": ""}]'::jsonb,
    2023,
    'Bundesanstalt für Finanzdienstleistungsaufsicht',
    'https://www.bafin.de/',
    'complete'
  );
