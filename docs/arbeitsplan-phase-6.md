# Arbeitsplan Phase 6 – Ausbau nach Bedarf

Ziel der Phase: Gezielte Erweiterungen rund um das fertige Kernsystem – Exporte, eigene Notizen, Nachrecherche und der Zitations-Prüfbericht für die Abgabe.

**Wichtigster Unterschied zu den Phasen 1–5:** Diese Pakete sind à la carte. Paket 0 priorisiert nach echtem Bedarf aus dem Schreibprozess; Pakete dürfen übersprungen oder verschoben werden. Das Schreiben der ISP hat immer Vorrang vor dem Bauen.

Voraussetzung: Phase 5 abgeschlossen.

---

## ⚠️ Eingeschobenes Paket F – Fixes & Feinschliff (zuerst, vor Paket 0) ☑

Drei Korrekturen an bestehendem Verhalten – keine neuen Features, daher vorrangig und ohne Bedarfs-Check:

1. **Funktions-Chips in der Schreibwerkstatt:** Am Abschnitt sind bisher nur FFs und Themenfelder verknüpfbar – die Funktion-in-der-Arbeit (Einleitung/Problemstellung, Methodik, …) fehlt als Chip-Auswahl. Ergänzen; der Zitat-Pool des Abschnitts berücksichtigt die Funktion dann im Vorfilter (ein Methodik-Abschnitt zeigt Methodik-Literatur).
2. **Ranking-Matching bei Venue-Änderung:** Der VHB/SJR/CORE-Abgleich läuft bisher nur in der DOI-/Metadaten-Anreicherung. Er muss zusätzlich automatisch ausgelöst werden, sobald das Venue-Feld gesetzt oder geändert wird – egal auf welchem Weg (manuelle Eingabe, BibTeX-Import, Korrektur-Dialog, graue-Literatur-Erfassung). Handisch gesetzte Rankings werden dabei nicht überschrieben, nur leere/automatische. Backfill: einmalig alle Quellen mit Venue, aber ohne Ranking-Ergebnis nachziehen.
3. **Abgeschnittene Zitate in der Schreibwerkstatt:** Beide Maßnahmen umsetzen: (a) Popover bei Hover (Desktop) bzw. Tap (mobil) auf eine Zitat-Karte zeigt das vollständige Zitat samt Übersetzung und Zitation – das ist der Hauptweg, weil er auch mobil funktioniert; (b) am Desktop zusätzlich verstellbare Spaltenbreiten (Trenner ziehbar, Einstellung wird gespeichert).
4. **Themenfelder sortierbar:** In den Einstellungen erhalten die Themenfelder dieselbe Drag-&-Drop-Sortierung wie die Forschungsfragen (Feld `sortierung` an `topics`, falls noch nicht vorhanden, per Migration ergänzen). Die Reihenfolge steuert die Anordnung im Venn-Diagramm und die Chip-/Filter-Reihenfolge überall im Tool.

- **Fertig, wenn:** Ein Methodik-Abschnitt passende Literatur im Pool zeigt, eine manuelle Venue-Eingabe sofort ein Ranking liefert, jedes Zitat vollständig lesbar ist (mobil per Tap geprüft), und eine Umsortierung der Themenfelder das Venn-Diagramm sichtbar umstellt.

**Notizen:**

**Architektur-Rückfrage zu Punkt 2 (mit dem Autor abgestimmt):** Ranking-Matching läuft bislang ausschließlich als manueller Worker-Batch-Befehl (`littool-worker match-ranking`), der die lokalen CSVs (`data/rankings/*.csv`) liest - nirgends automatisch an die DOI-/Metadaten-Anreicherung gekoppelt. Ein echtes "sofort" (Browser/Edge Function matched live) hätte die Ranking-Daten zusätzlich in eine DB-Tabelle dupliziert (CSV bleibt Referenz, DB-Tabelle waere Laufzeit-Kopie, jedes CSV-Update braeuchte einen Re-Import). Rückfrage im Chat gestellt - Autor entschied sich für die schlankere Variante **ohne echtes Sofort-Matching**: Venue-Änderung setzt ein automatisch gesetztes Ranking zurück (`null`), der nächste `match-ranking`-Lauf zieht es nach.

**Migration `0039_paket_f_fixes.sql`:**
- `section_functions` (section_id, function_id) - analog zu `section_topics`/`section_research_questions` (Migration 0032); die Funktion-Dimension selbst existiert bereits seit Migration 0023 (`work_functions`/`source_functions`, Phase 3 Paket F), hier nur die fehlende Section-Verknüpfung dazu.
- `sources.ranking_manual boolean not null default false` + Trigger `reset_ranking_on_venue_change` (`before update`, feuert bei jeder Venue-Änderung unabhängig vom schreibenden Client - Frontend-Korrektur-Dialog, Worker-BibTeX-Import, graue-Literatur-Erfassung): setzt `ranking_system`/`ranking_value` auf `null` zurück, außer `ranking_manual = true`. Ein DB-Trigger statt Instrumentierung jeder einzelnen Aufrufstelle - gleiches Zentralisierungsprinzip wie die `triage`-Ausblendung in `fetchSources()` (Phase 5, Paket E).
- `topics.sort_order integer not null default 0`, Backfill nach aktueller alphabetischer Reihenfolge (0/1/2 für die drei bestehenden Themenfelder) - keine sichtbare Verschiebung beim Rollout.

**`ranking_manual` wird nur bei einer tatsächlichen Handänderung gesetzt** (`QuellenDetail.tsx::handleSubmit`): Da Venue und Ranking im selben Formular liegen und jedes Speichern beide Felder mitsendet, würde ein naives "Formular gespeichert = manuell" jede Venue-Korrektur fälschlich einfrieren. Stattdessen vergleicht der Save-Handler `working.ranking_system`/`ranking_value` gegen die zuletzt geladenen Werte (`source?.ranking_system`/`ranking_value`) und setzt `ranking_manual: true` im Update-Payload nur, wenn sich mindestens eines der beiden tatsächlich geändert hat. Der Worker-Batch-Befehl (`ranking.py::run_ranking_match`) respektiert das Flag ebenfalls (`.eq("ranking_manual", False)` zusätzlich zum bestehenden `ranking_system IS NULL`-Filter) - sonst würde ein manuell auf "kein Ranking" gesetzter Wert beim nächsten Batch-Lauf wieder überschrieben.

**Zitat-Pool-Vorfilter um Funktion erweitert** (`lib/sectionPool.ts::filterPassagesForSection`): dritte ODER-Bedingung neben FF/Themenfeld - ein Zitat passt zusätzlich, wenn eine seiner bestätigten Funktionen mit den Funktions-Verknüpfungen des Abschnitts übereinstimmt. `fetchConfirmedPassagesPool` lädt `source_functions` jetzt im selben verschachtelten Select wie `source_topics` mit.

**Scope-Entscheidung „Drag-&-Drop" (Themenfelder):** Die Forschungsfragen, auf die Punkt 4 als Vorbild verweist, haben selbst kein echtes Drag&Drop, sondern ▲/▼-Buttons (`Einstellungen.tsx::ForschungsfragenCard`, aus demselben "kein Drag&Drop - CLAUDE.md schlank bleiben"-Grundsatz wie die Abschnitts-Sortierung in der Schreibwerkstatt, Phase 5 Paket 2). Themenfelder haben deshalb bewusst dasselbe ▲/▼-Muster bekommen statt echtem Drag&Drop, um konsistent zum tatsächlichen (nicht dem in der Planformulierung angenommenen) Vorbild zu bleiben - Fertig-Kriterium („Umsortierung stellt Venn-Diagramm sichtbar um") ist davon unabhängig erfüllt.

**Abgeschnittene Zitate:** der bisherige Klick-zum-Aufklappen-Mechanismus in `PoolPassageCard` wurde durch einen Popover ersetzt (Hover am Desktop, zusätzlich Klick/Tap zum Umschalten - Tap feuert kein `hover`, daher beide Wege). Popover zeigt Original + Übersetzung + Zitation überlagernd, ohne die Liste zu verschieben. Verstellbare Spaltenbreiten: Desktop-Dreispalten-Layout von `grid-cols-3` auf `flex` mit expliziten Prozent-Breiten pro Spalte umgestellt, zwei ziehbare Trenner dazwischen; Einstellung im `localStorage` (`littool:schreibwerkstatt:columnWidths`) - bewusst kein DB-Feld, da reine Desktop-Layout-Präferenz ohne Cross-Device-Bedarf (die Drei-Spalten-Ansicht existiert am Mobilgerät ohnehin nicht, dort sind es Tabs).

**Getestet:** TypeScript-Build (`tsc -b`) und `vite build` fehlerfrei. Live gegen die echte DB (Testdaten danach entfernt): `section_functions`-CRUD-Zyklus (Einleitung ↔ Methodik verknüpft, verifiziert, wieder gelöst) am echten ISP-Abschnitt; Trigger-Verhalten an einer temporären Test-Quelle geprüft - Venue-Änderung bei `ranking_manual=false` setzt Ranking korrekt zurück, bei `ranking_manual=true` bleibt ein manuell gesetztes Ranking (SJR Q1) trotz Venue-Änderung unangetastet; `topics.sort_order`-Tausch an den drei echten Themenfeldern durchgespielt und wieder in die ursprüngliche Reihenfolge zurückgesetzt. **Backfill ausgeführt** (`littool-worker match-ranking` gegen die Produktions-DB): 9 zusätzliche Rankings gefunden, 26 weiterhin ohne Treffer (jetzt 42 von 68 relevanten Quellen mit Ranking-Ergebnis). **Kein Browser-Klick-Test möglich:** Die App verlangt einen echten Login (Single-User-Auth), Zugangsdaten liegen dem Assistenten nicht vor und dürfen laut Richtlinie ohnehin nicht eingegeben werden - Dev-Server startete fehlerfrei und lieferte die Login-Seite korrekt aus, die eigentliche UI (Chips, Popover, Spaltenbreiten-Drag) wurde stattdessen per Code-Review + den obigen DB-seitigen Tests abgesichert, nicht durch tatsächliches Klicken. Empfehlung: bei Gelegenheit einmal selbst kurz durchklicken, insbesondere den Spalten-Drag und den Popover auf dem Handy.

---

## Paket 0 – Bedarfs-Check & Priorisierung ☑

- Kurzer Review mit dem Autor (Fragen im Chat beantworten lassen oder als Kommentar in dieser Datei): Was fehlt beim Schreiben konkret? Welche der Pakete 1–6 lösen ein echtes, aktuelles Problem?
- Reihenfolge der Pakete entsprechend festlegen; nicht Benötigtes als „zurückgestellt" markieren.
- Nebenbei: Kosten-Review (AiLog-Tokens seit Start), Backup-Routine verifizieren (letzter Dump? Restore-Test noch gültig?).
- **Fertig, wenn:** Eine priorisierte, ehrliche Paketliste steht.

**Notizen:**

**Dialog im Chat geführt (2026-07-28).** Priorisierte Reihenfolge: **Paket F** (Fixes, ohnehin ohne Bedarfs-Check vorrangig) → **Paket 1** (Zitations-Prüfbericht) → **Paket 2** (Nachrecherche via OpenAlex) → **Paket 3** (Exporte: BibTeX/Methodentabelle/Deskriptionsmatrix). **Zurückgestellt:** Paket 4 (Eigene Notizen/Confluence-Import), Paket 5 (Weitere Grafiken), Paket 6 (Abrundung & Dokumentation) - kein aktueller Bedarf beim Schreiben genannt, bleiben à la carte für später.

**Kosten-Review** (Direktabfrage `ai_log_entries`, 2026-07-28): 1.242.196 Tokens seit Start - `analyse` 541.969 (179 Einträge), `passagen_extraktion` 462.854 (135), `methodenprofil` 232.899 (84), `chat` 4.474 (1, echte Nutzung vom 28.07., keine Testreste - alle Schreibwerkstatt-QS-Testläufe aus Phase 5 wurden wie dokumentiert wieder entfernt).

**Backup-Routine:** letzter Dump `backups/20260726_221744` (26.07., zwei Tage alt zum Zeitpunkt der Prüfung), enthält `schema.sql`, `data.sql` und `pdfs/` vollständig. **Offen:** Restore-Test wurde noch nicht angefragt/bestätigt - beim Autor nachzufragen, ob das CLAUDE.md-Pflicht-Item „Restore einmal testweise durchspielen" bereits erledigt ist.

## Paket 1 – Zitations-Prüfbericht für Word-Dokumente ☐

*(aus der Ideen-Liste übernommen – wertvollster Baustein vor jeder Abgabe)*

- Upload einer .docx (ISP/Exposé/Diss-Entwurf); Extraktion aller Zitationen im Text (APA-Muster inkl. Seitenangaben) und des Literaturverzeichnisses.
- Abgleich gegen die Datenbank: Quelle vorhanden? Autor/Jahr/Seite plausibel (Seiten-Offset berücksichtigen)? Wörtliche Zitate im Dokumenttext der Quelle nachweisbar (String-Verifikation rückwärts)? Zitierte Quellen vollständig im Verzeichnis und umgekehrt (Waisen-Einträge beidseitig)?
- Ergebnis: Prüfbericht mit Fundstellen (Seite im Word-Dokument), Schweregrad (Fehler/Warnung/Hinweis) und Korrektur-VORSCHLÄGEN zum einzelnen Übernehmen als Liste – KEIN automatisches Umschreiben der Word-Datei.
- **Fertig, wenn:** Ein echter ISP-Entwurf geprüft wurde und der Bericht mindestens einen realen Befund korrekt identifiziert (oder sauber „keine Befunde" meldet).

## Paket 2 – Nachrecherche via OpenAlex ☐

- Such-Ansicht erhält Tab „Extern": Stichwort-/Themensuche direkt gegen OpenAlex (kostenlose API); Treffer mit Titel, Autoren, Jahr, Venue, Zitationszahl, Abstract.
- Abgleich mit eigenem Bestand: bereits vorhandene Treffer werden markiert („im Bestand"), verworfene ebenfalls („bereits verworfen am …", aus Paket E).
- Ein-Klick-Übernahme interessanter Treffer **in den Eingang/Prüf-Pool** (Paket E) – Open-Access-PDF wird, wo verfügbar, direkt mitgeladen; sonst Metadaten-Eintrag mit Kennzeichen `kein PDF`.
- **Fertig, wenn:** Eine externe Suche → Prüf-Pool → Übernahme durchgängig funktioniert.

## Paket 3 – Exporte: BibTeX, Methodentabelle, Deskriptionsmatrix ☐

- BibTeX-Export: gesamter Bestand oder nur verwendete Quellen des aktiven Dokuments (.bib-Download) – macht den Bestand portabel (kein Lock-in).
- Methodentabelle: Quellen × Methodenprofil (Studientyp, Methode, Sample, Auswertung) als kopierbare Word-Tabelle und CSV; Filter wie in der Bibliothek.
- Deskriptionsmatrix: kombinierbare Spalten (Ranking, Methodenprofil, Relevanz je FF, Themenfelder) als Export für den Literaturreview-Teil der Arbeit.
- **Fertig, wenn:** Alle drei Exporte in Word eingefügt sauber aussehen.

## Paket 4 – Eigene Notizen (Confluence-Import) ☐

- Neuer Quellentyp `note`: eigene Notizen mit Titel, Text, optionalen Verknüpfungen zu Quellen/Themenfeldern; im Chat und in der Suche auffindbar, aber ausgeschlossen von Literaturverzeichnis, Matrizen und Rankings (es ist keine zitierfähige Literatur).
- Einmaliger Confluence-Import: Export aus Confluence (HTML/Space-Export) hochladen → Seiten werden als Notizen übernommen (Titel + bereinigter Text); Auswahl-Dialog, welche Seiten importiert werden.
- Kennzeichnung in der Suche/im Chat: Notizen-Treffer sind klar als „eigene Notiz" markiert, damit sie nie mit Literaturbelegen verwechselt werden.
- **Fertig, wenn:** Die relevanten Confluence-Inhalte als durchsuchbare Notizen im Tool liegen.

## Paket 5 – Weitere Grafiken ☐

- Kleine Auswertungs-Galerie in den Protokollen oder der Bibliothek: Quellen nach Jahr (Balken), nach Ranking (Balken), nach Studientyp (Torte/Balken); konsistent zum Venn-Design.
- Export jeder Grafik als PNG/SVG für die Arbeit.
- **Fertig, wenn:** Die Grafiken den echten Bestand zeigen und exportiert in Word gut aussehen.

## Paket 6 – Abrundung & Dokumentation ☐

- README aktualisieren: Was kann das Tool, wie startet man es, wie läuft das Backup.
- docs-Stand mit dem realen Funktionsumfang abgleichen (Konzept als „as built" markieren).
- Offene Kleinigkeiten aus allen Phasen (gesammelte TODOs) bewerten: fixen oder bewusst dokumentiert lassen.
- **Fertig, wenn:** Ein Außenstehender (oder du in sechs Monaten) das Projekt anhand der Doku versteht und betreiben kann. 🎉

---

## Bewusst NICHT in Phase 6

- **KI-optional-Modus / BYO-Key und Mandantenfähigkeit** bleiben auf der Ideen-Liste – erst relevant, wenn eine Weitergabe an Mitdoktoranden konkret ansteht (und die Nebentätigkeitsfrage geklärt ist).
- Miro-Anbindung, Live-Confluence, Word-Plugin: bleiben Nicht-Ziele.

## Danach

Nichts. Schreiben. 📝
