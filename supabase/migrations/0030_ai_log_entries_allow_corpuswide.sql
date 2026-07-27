-- "Kriterien vorschlagen" ist eine korpusweite KI-Aktion (bezieht sich auf
-- kein einzelnes source_id/passage_id), aber jede KI-Aktion muss laut
-- CLAUDE.md protokolliert werden. Der bisherige Check-Constraint erzwingt
-- mindestens eins von beidem - wird hier gelockert, damit auch
-- quellen-uebergreifende Aktionen geloggt werden koennen.

alter table public.ai_log_entries drop constraint ai_log_entries_check;
