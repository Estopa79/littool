-- Nutzer-Feedback: Evaluationsmatrix soll auf den in der Deskriptionsmatrix
-- ausgewaehlten Quellen aufbauen, Kriterien sollen direkt in der Ansicht
-- verwaltbar sein (Beschreibung + Herleitung, manuell oder per KI-Vorschlag),
-- und die Bewertung pro Zelle auf ein 4-stufiges Mass umgestellt werden
-- (0=leer, 1=viertel, 2=halb, 3=voll) statt der bisherigen 3 Stufen.
--
-- Reihenfolge wichtig: Constraint zuerst weiten, dann Werte remappen, sonst
-- verletzt der Zwischenschritt (alter Wert 2 -> neuer Wert 3) die alte
-- Check-Bedingung (0,1,2). Reihenfolge des Remappings (erst 2->3, danach
-- 1->2) vermeidet eine Kollision zwischen "voll" und "teilweise".

alter table public.source_criteria drop constraint source_criteria_value_check;
alter table public.source_criteria add constraint source_criteria_value_check check (value in (0, 1, 2, 3));

update public.source_criteria set value = 3 where value = 2;
update public.source_criteria set value = 2 where value = 1;

-- Kriterien koennen jetzt auch von der KI vorgeschlagen werden (Herleitung
-- gab es schon) - gleiches confirmed-Prinzip wie ueberall sonst: manuell
-- angelegte Kriterien gelten sofort als bestaetigt, KI-Vorschlaege nicht.
alter table public.criteria add column confirmed boolean not null default true;
update public.criteria set confirmed = true;
