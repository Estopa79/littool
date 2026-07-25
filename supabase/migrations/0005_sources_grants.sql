-- Fix zu 0001: RLS-Policies ersetzen keine Tabellenrechte. Da 0001 die
-- Default Privileges für anon/authenticated im public-Schema entzogen hat,
-- braucht jede neue Tabelle zusätzlich ein explizites GRANT an authenticated
-- (die RLS-Policy filtert dann nur noch zeilenweise).

grant select, insert, update, delete on public.sources to authenticated;
