# Arbeitsplan Phase 4 – Verwendungs-Tracking & Verzeichnisse

Ziel der Phase: Zitate lassen sich pro Dokument (ISP/Exposé/Dissertation) als „verwendet" anhaken. Daraus entstehen auf Knopfdruck: das alphabetische Literaturverzeichnis (APA 7), der KI-Verzeichnis-Export für die Hochschule und die Aktivitätsübersicht fürs Dissertationsprotokoll. Alle Kopier-Buttons kennzeichnen Übersetzungen korrekt.

Voraussetzung: Phase 3 abgeschlossen (Zitat-Pool funktioniert, AiLog wird befüllt).

---

## Paket 0 – Rückblick Phase 3 ☑

- Offene Punkte prüfen: unbestätigte Zuordnungen (Anzahl), Zitat-Pool-Größe, AiLog-Vollständigkeit (loggen wirklich alle KI-Aktionen?).
- Lücken im AiLog schließen, falls eine Aktion nicht protokolliert wird – das ist Pflicht (CLAUDE.md, Prinzip 3).
- **Fertig, wenn:** AiLog nachweislich lückenlos ist und der Ausgangszustand sauber dokumentiert wurde.

**Notizen:**

*Offene Punkte aus Phase 3 (Stand geprüft, per Direktabfrage der Produktions-DB):*
- **Eingeschobenes Paket K:** ☑ abgeschlossen (Seiten-Offset, Zitationslogik, Backup/Restore-Test) – keine offenen Punkte.
- **Eingeschobenes Paket B (BibTeX-Import):** Haken im Phase-3-Plan noch ☐. Funktional weitgehend erledigt (38 per DOI, 17 per Titel, 9 im Chat geklärt = 64 automatisch/manuell zugeordnet), 28 unmatched Einträge liegen als Datei beim Autor zur späteren manuellen Prüfung – bewusst kein dediziertes UI dafür gebaut (einmalige Aufräumaktion). Bleibt offen, bis der Autor diese 28 Fälle durchgeht; kein Blocker für Phase 4.
- **Eingeschobenes Paket F (Funktion-Dimension):** ☑ abgeschlossen.
- **Paket 10 (Backfill & Kalibrier-Abschluss):** weiterhin ☐ – der geplante QS-Durchgang durch den Autor hat noch nicht stattgefunden.

*Unbestätigte Zuordnungen (Anzahl je Dimension, Stand 2026-07-27):*

| Dimension | gesamt | bestätigt | unbestätigt |
|---|---|---|---|
| Themenfelder (`source_topics`) | 145 | 1 | 144 |
| Relevanz je FF (`source_rq_relevance`) | 665 | 1 | 664 |
| Zitate (`passages`) | 190 | 0 | 190 |
| Methodenprofile (`method_profiles`) | 95 | 1 | 94 |
| Funktionen (`source_functions`) | 95 | 2 | 93 |

*Zitat-Pool-Größe:* **0 bestätigte Zitate** von 190 erzeugten Kandidaten. Der Pool, auf dem Phase 4 (Verwendet-Ansicht, Literaturverzeichnis, KI-Verzeichnis-Export) aufbaut, ist damit aktuell praktisch leer – der QS-Durchgang aus Phase-3-Paket-10 ist noch nicht erfolgt. Kein Blocker für den Bau der Phase-4-Funktionen selbst (die Pakete lassen sich mit wenigen manuell bestätigten Testzitaten prüfen), aber der Autor muss vor einem echten Endnutzen durch `/pruefen` gehen.

*AiLog-Vollständigkeit:* Alle Code-Pfade, die Claude aufrufen, protokollieren nachweislich (Grep über Worker + alle 6 Edge Functions): `analysis.py` (Themen/Relevanz, Funktions-Vorschlag, Methodenprofil, Kriterien-Bewertung – 4 Insert-Stellen), `passages.py` (Zitat-Extraktion), sowie die Edge Functions `generate-citations`, `paraphrase-passage`, `generate-topic-relevance`, `generate-descriptive-entry`, `suggest-criteria`, `generate-criteria-evaluation`. Nicht-KI-Aktionen (Crossref-/OpenAlex-Anreicherung, BibTeX-Import) loggen bewusst nicht – kein Verstoß gegen Prinzip 3. Verteilung der 453 vorhandenen Einträge: 202 `analyse`, 156 `passagen_extraktion`, 95 `methodenprofil`, 0 `paraphrase` (Funktion ist korrekt verdrahtet, wurde aber seit dem einmaligen Kalibrier-Test in Paket 9 nicht mehr produktiv genutzt). Ein Eintrag ganz ohne Quellen-/Passagen-Bezug (`suggest-criteria`, korpusweit) ist erwartungsgemäß laut Migration 0030. Keine Lücke gefunden, keine Code-Änderung nötig.

## Paket 1 – Schema: Dokumente & Verwendung ☐

- Migration: `documents` in Minimalform (id, typ: ISP/Exposé/Dissertation, titel, status) – bewusst OHNE Gliederung/Sections, die kommen in Phase 5. Die drei realen Dokumente als Seed anlegen.
- Migration: `used_citations` (passage_id, document_id, angehakt_am) – Häkchen gilt pro Dokument.
- **Fertig, wenn:** Migrationen laufen, ein Zitat lässt sich per SQL für ISP anhaken, für Diss nicht.

## Paket 2 – Häkchen-UI & Dokument-Kontext ☐

- Globale Dokument-Auswahl im Kopfbereich (Dropdown: ISP / Exposé / Dissertation) – bestimmt, worauf sich Häkchen beziehen.
- Häkchen an allen Zitat-Karten (FF-Ansicht, Suche, Quellen-Detail); Zustand je aktivem Dokument sichtbar.
- Beim späteren Übernehmen von Abschnitten (Phase 5) sollen Häkchen mitwandern können – Datenmodell lässt das bereits zu, UI dafür kommt später.
- **Fertig, wenn:** Anhaken/Abhaken überall flüssig funktioniert, auch mobil, und beim Dokumentwechsel korrekt umschaltet.

## Paket 3 – Verwendet-Ansicht ☐

- Ansicht gemäß Wireframe: Zähler („n verwendete Zitate aus m Quellen"), Gruppierung umschaltbar (nach Quelle / nach Forschungsfrage), Karten mit Kurzzitation und Kopier-Buttons, Abhaken direkt hier möglich.
- **Fertig, wenn:** Die Ansicht den echten Arbeitsstand des aktiven Dokuments zeigt.

## Paket 4 – Literaturverzeichnis-Generator ☐

- Knopf „Literaturverzeichnis erzeugen": alle Quellen mit mindestens einem angehakten Zitat im aktiven Dokument, alphabetisch nach Erstautor, APA 7.
- Typgerechte Formatierung: Journal-Artikel, Buch, Buchkapitel, Konferenzbeitrag, graue Literatur/Institution (BaFin, 2023 …), Online-Quelle mit Abrufdatum.
- Ausgabe als kopierbarer Textblock (fürs Einfügen in Word) + einzelne Einträge separat kopierbar.
- Sonderfälle prüfen: mehrere Werke gleicher Autor + Jahr (2023a, 2023b), fehlende Angaben sichtbar markieren statt stumm weglassen.
- **Fertig, wenn:** Das erzeugte Verzeichnis für ~10 gemischte Quellen (inkl. grauer Literatur) einem manuellen APA-Check standhält.

## Paket 5 – Kopier-Buttons mit Kennzeichnung ☐

- Jede Zitat-Karte bekommt getrennte Kopier-Varianten: **Original** (mit Zitation), **Übersetzung** (mit Zitation + Zusatz „[Übersetzung durch den Verfasser]"), **Paraphrase** (mit Zitation).
- Der Übersetzungs-Zusatz ist nicht abwählbar – verhindert, dass ungekennzeichnete Übersetzungen als wörtliche Zitate in der Arbeit landen.
- **Fertig, wenn:** Alle drei Varianten korrekt formatiert in Word ankommen (Copy-Paste-Test).

## Paket 6 – KI-Verzeichnis-Export ☐

- Protokolle-Ansicht, Tab „KI-Verzeichnis": AiLog gefiltert nach Monat/Zeitraum; gleichartige Aktionen pro Tag aggregiert („Übersetzung von 6 Passagen", „Zitat-Erzeugung für 3 Quellen").
- Export als kopierbare Tabelle (Datum, Art der Nutzung, Bezug) – Format an der Hochschulvorgabe fürs KI-Verzeichnis orientieren (Autor liefert die Vorgabe in der Sitzung, falls vorhanden).
- **Fertig, wenn:** Ein Monat lässt sich als saubere Tabelle nach Word kopieren.

## Paket 7 – Aktivitätsübersicht ☐

- Tab „Aktivität": aus vorhandenen Zeitstempeln (Uploads, Bestätigungen, Zitat-Erzeugung, Häkchen …) je Monat und Kalenderwoche die aktiven Tage ableiten; Anzeige wie im Wireframe (KW-Zeilen, Monatssumme aktiver Tage).
- Bewusst ohne Stunden – Gedächtnisstütze fürs händische Dissertationsprotokoll; Hinweistext dazu in der Ansicht.
- Kopierbare Monatsübersicht.
- **Fertig, wenn:** Der Juli zeigt plausibel die Tage, an denen tatsächlich am Tool gearbeitet wurde.

## Paket 8 – End-to-End-Abnahme ☐

- Kompletter Durchlauf am echten Bestand: Zitate für einen Abschnitt anhaken → Verwendet-Ansicht prüfen → Literaturverzeichnis erzeugen → in ein Word-Dokument einfügen → KI-Verzeichnis für den Monat exportieren → Backup laufen lassen.
- **Fertig, wenn:** Der Durchlauf ohne Handarbeit an den Ausgaben funktioniert → Phase 4 abgeschlossen. 🎉

---

## Danach

Arbeitsplan Phase 5 (Schreibwerkstatt: Gliederung, Agenten-Entwürfe, Debatte, Versionierung) im Chat erstellen. Vorher klären: Promotionsordnung/KI-Verzeichnis-Vorgabe zur Nutzung von KI-Textentwürfen (ggf. mit Betreuer abstimmen).
