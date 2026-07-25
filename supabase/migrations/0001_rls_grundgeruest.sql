-- Paket 1: RLS-Grundgerüst
-- Sperrt den Zugriff auf das public-Schema für anonyme und nicht-eingeloggte
-- Zugriffe standardmäßig. Jede künftige Tabelle muss explizit
-- `ENABLE ROW LEVEL SECURITY` und eine Policy für die `authenticated`-Rolle
-- bekommen (siehe Muster unten) - ohne das ist die Tabelle für niemanden
-- lesbar/schreibbar, auch nicht für authentifizierte Nutzer.

-- Keine impliziten Rechte für neue Tabellen/Sequenzen im public-Schema.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

-- Anonyme Rolle bekommt grundsätzlich keine Rechte im public-Schema.
revoke all on schema public from anon;

-- Muster für künftige Migrationen (pro Tabelle wiederholen):
--
-- alter table public.<tabelle> enable row level security;
--
-- create policy "<tabelle>_authenticated_all"
--   on public.<tabelle>
--   for all
--   to authenticated
--   using (true)
--   with check (true);
--
-- Single-User-App: RLS unterscheidet nicht nach Benutzer, sondern nur
-- zwischen "eingeloggt" (voller Zugriff) und "nicht eingeloggt" (kein Zugriff).
