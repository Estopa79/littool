-- Phase 5, Paket 5: Schema-Ergaenzungen fuer den Agenten-Entwurf.
--
-- `draft_passages.marker`: welcher Belegmarker [n] im Entwurfstext auf diese
-- Passage zeigt. draft_passages speichert ab jetzt nur tatsaechlich per
-- Marker zitierte Passagen (nicht die groessere Eingabe-Auswahl aus Paket 4 -
-- die bleibt bewusst reiner, nicht persistierter Client-State, s. Notizen
-- Paket 4). Das ist zugleich die Datengrundlage fuer Paket 8 ("per Marker
-- verwendete Zitate automatisch anhaken").
--
-- `drafts.unverified_claims`: Ergebnis der Belegpruefung (Nachpruefung) - vom
-- Beleg nicht gedeckte Aussagen werden hier sichtbar mitgefuehrt statt
-- stillschweigend akzeptiert, dauerhaft an der jeweiligen Version haengend
-- (nicht nur am erzeugenden Job, der irgendwann aufgeraeumt werden koennte).
--
-- `ai_log_entries.action_type`: neuer Wert 'entwurf' fuer die KI-Aktion
-- "Agenten-Entwurf erzeugt" - Constraint-Name wird dynamisch ermittelt statt
-- geraten, da kein lokaler DB-Zugriff (Docker) besteht, um ihn vorab zu
-- pruefen.

alter table public.draft_passages
  add column marker integer not null,
  add constraint draft_passages_marker_unique unique (draft_id, marker);

alter table public.drafts
  add column unverified_claims jsonb not null default '[]'::jsonb;

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
  check (action_type in ('analyse', 'uebersetzung', 'passagen_extraktion', 'methodenprofil', 'paraphrase', 'entwurf'));
