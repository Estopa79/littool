-- Paket 3: PDF-Upload legt die Quelle an, bevor der Typ bekannt ist
-- (der wird erst durch Crossref-Metadaten in Paket 5 bzw. den
-- Erfassungsdialog für graue Literatur in Paket 9 gesetzt).
-- Der CHECK erlaubt NULL bereits automatisch, nur NOT NULL muss weg.

alter table public.sources alter column type drop not null;
