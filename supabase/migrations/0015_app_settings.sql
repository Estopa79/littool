-- Phase 3, Paket 2: App-Einstellungen (Dissertationsthema)
--
-- Singleton-Tabelle fuer globale, nicht-listenartige Konfiguration (aktuell nur
-- das Dissertationsthema als Freitext). Forschungsfragen und Themenfelder haben
-- eigene Tabellen (0014) und werden hier nicht dupliziert.
--
-- Singleton-Muster: `id boolean primary key default true` + `check (id)`
-- erzwingt ueber den Primary-Key-Constraint, dass nie mehr als eine Zeile
-- existieren kann (jede weitere Zeile muesste ebenfalls id=true haben und
-- verletzt damit den Primary Key).

create table public.app_settings (
  id boolean primary key default true check (id),
  dissertation_theme text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;
create policy "app_settings_authenticated_all"
  on public.app_settings for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.app_settings to authenticated;
