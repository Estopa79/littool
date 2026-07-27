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

## Paket 1 – Schema: Dokumente & Verwendung ☑

- Migration: `documents` in Minimalform (id, typ: ISP/Exposé/Dissertation, titel, status) – bewusst OHNE Gliederung/Sections, die kommen in Phase 5. Die drei realen Dokumente als Seed anlegen.
- Migration: `used_citations` (passage_id, document_id, angehakt_am) – Häkchen gilt pro Dokument.
- **Fertig, wenn:** Migrationen laufen, ein Zitat lässt sich per SQL für ISP anhaken, für Diss nicht.

**Notizen:**

Migration `0031_documents_used_citations.sql`. `documents.type` als Check-Constraint (`isp`/`expose`/`dissertation`, englisch/snake_case per CLAUDE.md), `status` ebenfalls constraint (`active`/`submitted`/`archived`) analog zum bestehenden Muster bei `sources.status`. Die drei realen Dokumente wurden geseedet (Titel entsprechen den Wireframe-Labels des künftigen Dropdowns, keine Testdaten). `used_citations` ohne eigenes Boolean-Flag - Existenz der Zeile (`passage_id`, `document_id`) als Primary Key *ist* das Häkchen, `used_at` statt `angehakt_am` (Spaltennamen englisch).

Bei `db push` aufgefallen: Die Migrations-History-Tabelle auf Remote kannte nur `0001` als angewendet, obwohl Schema/Daten aller 30 folgenden Migrationen nachweislich vorhanden waren (vermutlich frühere Anwendung außerhalb von `supabase db push`, z. B. direkt per SQL/Dashboard). Ein blinder `db push` hätte versucht, bereits existierende Objekte erneut anzulegen (Fehler beim erneuten `create policy` aus 0002 bestätigte das). Behoben mit `supabase migration repair --status applied 0002…0030` (reine Bookkeeping-Korrektur, keine SQL-Ausführung), erst danach `db push` für die neue Migration 0031 - History jetzt lückenlos synchron.

Test (Paket-Kriterium) direkt per REST/SQL gegen die echte DB: ein reales Zitat für ISP angehakt, Abfrage bestätigt Häkchen für ISP und korrekt keins für Dissertation, Testzeile danach wieder entfernt (keine bleibenden Daten aus dem Test).

## Paket 2 – Häkchen-UI & Dokument-Kontext ☑ (Suche ausgenommen, s. u.)

- Globale Dokument-Auswahl im Kopfbereich (Dropdown: ISP / Exposé / Dissertation) – bestimmt, worauf sich Häkchen beziehen.
- Häkchen an allen Zitat-Karten (FF-Ansicht, Suche, Quellen-Detail); Zustand je aktivem Dokument sichtbar.
- Beim späteren Übernehmen von Abschnitten (Phase 5) sollen Häkchen mitwandern können – Datenmodell lässt das bereits zu, UI dafür kommt später.
- **Fertig, wenn:** Anhaken/Abhaken überall flüssig funktioniert, auch mobil, und beim Dokumentwechsel korrekt umschaltet.

**Notizen:**

`lib/ActiveDocumentContext.tsx` (React-Context, gleiches Muster wie `AuthProvider.tsx`): lädt die drei Dokumente einmal, hält die aktive Auswahl in `localStorage` (`littool.activeDocumentId`, überlebt Reload/Tab-Wechsel) und den kompletten Satz verwendeter `passage_id`s des aktiven Dokuments als `Set` (ein Fetch pro Dokumentwechsel, gleiche Bestandsgrößen-Annahme wie `qsReview.ts`). `toggleUsed` schreibt optimistisch und macht bei einem DB-Fehler die UI-Änderung wieder rückgängig, statt einen falschen Zustand stehen zu lassen. Dropdown im Kopfbereich (`AppLayout.tsx`) fest in der Reihenfolge ISP → Exposé → Dissertation (nicht alphabetisch). `components/UsedCitationCheckbox.tsx` kapselt Checkbox + Fehleranzeige (`✗`), eingebunden in `Forschungsfragen.tsx` (Zitat-Karten) und `QuellenDetail.tsx` (bestätigte Zitate der Quelle).

**Scope-Abweichung vom Plan (mit Nutzer abgestimmt):** Die Suche-Ansicht wurde bewusst ausgelassen. Sie durchsucht `chunks` (rohe Volltext-/Vektor-Treffer aus dem Ingest), nicht `passages` (bestätigte Zitate mit Übersetzung/Zitation) - `used_citations` hängt aber am `passage_id`. Ein Suchtreffer ist kein Zitat und hat keine 1:1-Beziehung zu einer Passage (weder über Seite noch sonst irgendwie zuverlässig herstellbar). Der Nutzer schaut sich das später an, ggf. mit einer eigenen Lösung - kein Blocker für die restlichen Phase-4-Pakete.

Verifikation: TypeScript-Build (`tsc -b`) und `vite build` fehlerfrei (ein vorbestehender, unabhängiger Fehler in `VennDiagram.tsx` bleibt unberührt, vor/nach dem Vergleich per `git stash` bestätigt). Live im Browser gegen die echte DB getestet (eine reale Passage testweise auf `confirmed=true` gesetzt, danach wieder zurückgesetzt - kein bleibender Dateneingriff): Checkbox in der FF-Ansicht angehakt → Zeile in `used_citations` mit `document_id=ISP` per Direktabfrage bestätigt; Dokument auf Dissertation umgeschaltet → Checkbox korrekt leer (per-Dokument-Zustand funktioniert); zurück zu ISP → wieder angehakt; Abhaken → Zeile korrekt gelöscht. Gleicher Test zusätzlich in `QuellenDetail.tsx` wiederholt (dieselbe Komponente, anderer Einbauort) - persistiert ebenfalls korrekt. Mobile Ansicht (375px) geprüft: Dropdown im Header verursacht keinen horizontalen Overflow.

## Paket 3 – Verwendet-Ansicht ☑

- Ansicht gemäß Wireframe: Zähler („n verwendete Zitate aus m Quellen"), Gruppierung umschaltbar (nach Quelle / nach Forschungsfrage), Karten mit Kurzzitation und Kopier-Buttons, Abhaken direkt hier möglich.
- **Fertig, wenn:** Die Ansicht den echten Arbeitsstand des aktiven Dokuments zeigt.

**Notizen:**

Ersetzt den Platzhalter-View. `lib/usedCitations.ts` laedt `used_citations` fuer das aktive Dokument in einem verschachtelten Select (→ `passages` → `research_questions`/`sources`), gleiches Join-Muster wie `ffView.ts`. Die Wireframe-Gruppierung „nach Abschnitt" existiert noch nicht (Section kommt erst Phase 5) - stattdessen wie im Arbeitsplan „nach Forschungsfrage" (Arbeitsplan > Wireframe laut CLAUDE.md). Karten zeigen bewusst nur einen einzelnen „Zitation kopieren"-Button (Original/Übersetzung/Paraphrase getrennt mit Kennzeichnung ist explizit Paket 5) - kein Vorgriff.

Zaehler und Gruppen filtern reaktiv ueber `isUsed()` aus dem in Paket 2 gebauten `ActiveDocumentContext` - die per Join geladene Liste ist die Obermenge, das Context-Set aus `used_citations` bestimmt live, was tatsaechlich sichtbar bleibt. Dadurch aktualisieren sich Zaehler/Gruppen sofort beim Abhaken in dieser Ansicht, ohne Neuladen.

Live gegen die echte DB getestet (3 reale Passagen aus 2 Quellen/2 Forschungsfragen testweise bestaetigt und fuer ISP angehakt, hinterher wieder vollstaendig zurueckgesetzt - kein bleibender Dateneingriff): Zaehler „3 verwendete Zitate aus 2 Quellen" korrekt, Gruppierung nach Quelle (Charoensuk et al. 2014: 2, Queiroz et al. 2020: 1) und nach Forschungsfrage (HFF: 2, TSFF2: 1) beide korrekt, Karten-Details (Original/Übersetzung/Zitation/PDF-Link) stimmen. Abhaken direkt in der Verwendet-Ansicht entfernt die Karte sofort und aktualisiert den Zaehler auf „2 verwendete Zitate aus 2 Quellen" - per Direktabfrage bestaetigt, dass die Zeile in `used_citations` tatsaechlich geloescht wurde.

Nebenbefund beim Testen: 3 Passagen sind zwischenzeitlich echt (nicht durch mich) auf `confirmed=true` gesetzt - der QS-Durchgang durch den Nutzer (`/pruefen`) laeuft offenbar bereits, unangetastet gelassen.

## Paket 4 – Literaturverzeichnis-Generator ☑ (Buchkapitel als Buch behandelt, s. u.)

- Knopf „Literaturverzeichnis erzeugen": alle Quellen mit mindestens einem angehakten Zitat im aktiven Dokument, alphabetisch nach Erstautor, APA 7.
- Typgerechte Formatierung: Journal-Artikel, Buch, Buchkapitel, Konferenzbeitrag, graue Literatur/Institution (BaFin, 2023 …), Online-Quelle mit Abrufdatum.
- Ausgabe als kopierbarer Textblock (fürs Einfügen in Word) + einzelne Einträge separat kopierbar.
- Sonderfälle prüfen: mehrere Werke gleicher Autor + Jahr (2023a, 2023b), fehlende Angaben sichtbar markieren statt stumm weglassen.
- **Fertig, wenn:** Das erzeugte Verzeichnis für ~10 gemischte Quellen (inkl. grauer Literatur) einem manuellen APA-Check standhält.

**Notizen:**

**Scope-Abweichung vom Plan (mit Nutzer abgestimmt):** Kein eigener Quellentyp „Buchkapitel" - das Schema kennt nur journal/konferenz/buch/grau/dissertation und hat kein Herausgeber-/Buchtitel-Feld, ein korrektes Kapitel-Zitat ("In: Hrsg. (Hrsg.), Buchtitel, S. x-y") liesse sich damit ohnehin nicht sauber bauen. Alle `type='buch'`-Quellen (inkl. des einen echten Kapitel-Falls im Bestand, Tornatzky/Fleischer "TOE Framework") werden einheitlich als Buch formatiert. Idee fuer spaeter (Herausgeber-/Buchtitel-Feld ergaenzen) noch nicht in `docs/ideen-spaeter.md` nachgetragen - folgt bei Gelegenheit.

`lib/apaFormat.ts`: reine, KI-lose Formatierungslogik (kein Claude-Aufruf, daher auch kein AiLog-Eintrag noetig - deterministische Regelanwendung auf vorhandene Metadaten). Autorenformat nach APA 7 (Komma vor „&" auch bei genau zwei Autoren, ab 21 Autoren Ellipse), Institutionen als Autor (leeres `given`) ohne Initialen. Typgerechte Locator-Bildung fuer journal (Venue, Band(Heft), Seiten), konferenz (\"In Tagungsband (S. x-y)\"), buch (Verlag), grau (Institution, optional „Abgerufen am [Erfassungsdatum des Bestands] von [URL]" bei vorhandener URL), dissertation (institutionelles Klammerzusatz-Format, im Bestand aktuell 0 Quellen - ungetestet gegen echte Daten). Fehlende Pflichtangaben (Autor, Venue/Verlag/Tagungsband) werden als sichtbare Klammer-Marker ausgegeben (`[Autor fehlt]` usw.) statt stumm wegzulassen; fehlendes Jahr nutzt die APA-Konvention „o. J." (bereits konsistent mit der bestehenden `format_citation`-DB-Funktion aus Phase 3).

**Sonderfall Autor+Jahr-Dopplung:** `assignYearSuffixes` gruppiert nur Quellen mit bekanntem Erstautor UND bekanntem Jahr (sonst waere eine Gruppierung nur geraten) und haengt bei echten Mehrfachtreffern a/b/… an, titel-alphabetisch sortiert. **Bekannte Einschraenkung (nicht in diesem Paket behoben):** Die In-Text-Zitation (`passages.citation`, erzeugt durch die `format_citation`-DB-Funktion aus Phase 3/Migration 0019) traegt diese Suffixe nicht - zwei verschiedene Werke gleichen Autors/Jahres waeren im Fliesstext beide z. B. „(GDV, 2024, S. x)" und nicht unterscheidbar. Eine Behebung wuerde die gemeinsame DB-Funktion aendern (wirkt auf alle Zitate im ganzen Bestand) und ist bewusst nicht Teil dieses eng auf das Literaturverzeichnis begrenzten Pakets - als Idee vorgemerkt.

Live gegen die echte DB getestet: 10 reale, gemischte Quellen (3 mit vorhandenen Passagen, 7 mit eigens angelegten Wegwerf-Test-Passagen, komplett wieder entfernt) fuer ISP angehakt - darunter Journal (Charoensuk 2014, mit Band/Heft/Seiten), Buch (Reinheimer 2017, Baker 2012 als Buchkapitel-Sonderfall), zwei Konferenzbeitraege (einer mit, einer ohne Venue - `[Tagungsband fehlt]` korrekt sichtbar), vier graue Literatur (davon einer mit echter URL - Abrufdatum korrekt aus `created_at` gebildet; einer mit institutionellem Autor „Mc Kinsey & Company"; einer mit fehlenden Autoren - `[Autor fehlt]` korrekt sichtbar), und der echte a/b-Dopplungsfall GDV 2024 (zwei tatsaechlich verschiedene GDV-Werke desselben Jahres) - korrekt als „GDV (2024a)"/„GDV (2024b)" aufgeloest. Alle 10 Eintraege manuell gegen APA 7 geprueft, alphabetische Sortierung nach Erstautor korrekt (fehlender Autor korrekt ans Ende sortiert). Auffaelligkeiten dabei waren ausschliesslich vorbestehende Datenqualitaets-Probleme im Bestand (Jahr „22" statt „2022" bei einer Konferenz-Quelle, Heft-Feld „Pre-Printed" bei Charoensuk, vertauschte given/family-Felder bei einer Quelle „Christine"/„Völzow") - unangetastet gelassen, nicht stillschweigend repariert.

Kopieren einzeln/gesamt nutzt denselben `navigator.clipboard.writeText`-Mechanismus wie die bestehenden Zitat-Kopierbuttons; automatisierte Verifikation scheiterte wie bereits in Phase 3 (Paket 7) dokumentiert an der Clipboard-Schreibberechtigung des Browser-Test-Tools selbst (`NotAllowedError`, per direktem JS-Test bestaetigt) - die Fehleranzeige („✗ fehlgeschlagen") greift dabei korrekt.

TypeScript-Build und `vite build` fehlerfrei (einziger Fehler weiterhin der vorbestehende, unabhaengige `VennDiagram.tsx`-Fall).

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
