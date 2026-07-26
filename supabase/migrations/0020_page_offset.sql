-- Phase 3, eingeschobenes Paket K: Seiten-Offset fuer korrekte Zitationsseiten
--
-- Fund waehrend der Kalibrierung von Paket 4: Journal-Artikel (und Buch-
-- Kapitel) beginnen im PDF praktisch immer bei Seite 1, im Journal/Sammelband
-- aber z. B. bei Seite 1319. Bisherige Zitationen nutzten die PDF-Seite
-- direkt - das ist fuer jeden Journal-/Kapitel-Fund falsch. page_offset
-- trennt PDF-Seite (Viewer-Sprung) von Zitationsseite (= PDF-Seite +
-- page_offset), siehe CLAUDE.md.

alter table public.sources
  add column page_offset integer not null default 0;

-- format_citation bekommt weiterhin nur eine fertige Zitationsseite als
-- Parameter (Signatur unveraendert) - Aufrufer (Trigger + Worker) rechnen
-- PDF-Seite + page_offset davor. Trigger feuert jetzt zusaetzlich bei
-- Aenderung von page_offset. WICHTIG: muss vor dem Backfill unten stehen,
-- sonst feuert der Backfill noch mit der alten Trigger-Version (die
-- page_offset noch nicht kennt) und die frisch erzeugten Passagen-Zitationen
-- (Paket 4) bleiben faelschlich unkorrigiert.

create or replace function public.sync_passage_citations()
returns trigger
language plpgsql
as $$
begin
  if (new.authors is distinct from old.authors)
     or (new.year is distinct from old.year)
     or (new.page_offset is distinct from old.page_offset) then
    update public.passages
    set citation = public.format_citation(new.authors, new.year, page + new.page_offset),
        updated_at = now()
    where source_id = new.id;
  end if;
  return new;
end;
$$;

-- Backfill nur fuer echte "NNN-NNN"-Seitenbereiche aus dem bereits
-- vorhandenen sources.pages-Feld (Crossref-Anreicherung, Phase 1) - eLocator-
-- IDs wie "101623" (kein Bereich, z. B. Elsevier-Artikelnummern) wuerden einen
-- voellig falschen Offset erzeugen und bleiben deshalb bewusst bei 0. Der
-- Trigger oben aktualisiert dabei automatisch alle schon erzeugten
-- Passagen-Zitationen dieser Quellen.
update public.sources
set page_offset = (regexp_match(pages, '^\s*(\d+)\s*[-–—]\s*\d+'))[1]::int - 1
where pages ~ '^\s*\d+\s*[-–—]\s*\d+';

-- Nicht ableitbare Faelle mit Bereichs-losem "pages"-Feld sichtbar markieren
-- statt stillschweigend bei Offset 0 zu belassen (koennte ein echter Bereich
-- sein, nur nicht in diesem Format erkennbar).
update public.sources
set status = 'needs_review',
    status_hint = coalesce(status_hint || ' / ', '') || 'Seiten-Offset nicht ableitbar (kein erkennbarer Seitenbereich in "pages") - bitte manuell in der Quellen-Detailseite pruefen'
where pages is not null
  and pages !~ '^\s*\d+\s*[-–—]\s*\d+';
