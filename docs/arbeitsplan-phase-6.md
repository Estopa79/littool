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

## Paket 1 – Zitations-Prüfbericht für Word-Dokumente ☑

*(aus der Ideen-Liste übernommen – wertvollster Baustein vor jeder Abgabe)*

- Upload einer .docx (ISP/Exposé/Diss-Entwurf); Extraktion aller Zitationen im Text (APA-Muster inkl. Seitenangaben) und des Literaturverzeichnisses.
- Abgleich gegen die Datenbank: Quelle vorhanden? Autor/Jahr/Seite plausibel (Seiten-Offset berücksichtigen)? Wörtliche Zitate im Dokumenttext der Quelle nachweisbar (String-Verifikation rückwärts)? Zitierte Quellen vollständig im Verzeichnis und umgekehrt (Waisen-Einträge beidseitig)?
- Ergebnis: Prüfbericht mit Fundstellen (Seite im Word-Dokument), Schweregrad (Fehler/Warnung/Hinweis) und Korrektur-VORSCHLÄGEN zum einzelnen Übernehmen als Liste – KEIN automatisches Umschreiben der Word-Datei.
- **Fertig, wenn:** Ein echter ISP-Entwurf geprüft wurde und der Bericht mindestens einen realen Befund korrekt identifiziert (oder sauber „keine Befunde" meldet).

**Notizen:**

**Architektur (wie Paket E, Phase 5):** Verarbeitung als Worker-CLI-Befehl (`littool-worker docx-review --review-id <id>`), kein `jobs`-Eintrag/Edge Function - rohe `.docx`-Bytes sind bislang ausschliesslich Domäne des Python-Workers (`python-docx`, neu zu den Worker-Abhängigkeiten hinzugefügt). Status lebt direkt an `docx_reviews.status` (`pending`/`running`/`done`/`failed`), gleiches einfache Muster wie `sources.triage_recommendation`.

**Bewusst kein Claude-Aufruf:** Der gesamte Abgleich (Zitations-Extraktion, Autor/Jahr-Matching, Seiten-Plausibilität, Zitat-String-Verifikation, Verzeichnis-Waisen) ist deterministischer Code (Regex + DB-Lookups) - gleiches Prinzip wie die strukturelle Belegprüfung bei Agenten-Entwürfen (Phase 5, Paket 5, „kein Vertrauen in Claude"): der Sinn eines Prüfberichts ist Verlässlichkeit, eine geratene KI-Einschätzung wäre hier schädlicher als nützlich. Kein neuer `ai_log_entries.action_type` nötig.

**Migration `0040_docx_review.sql`:** neue Tabellen `docx_reviews` (Status/Fehlermeldung/Zusammenfassung je Prüfung) und `docx_review_findings` (Schweregrad/Kategorie/Fundstelle/Kontext/Beschreibung/Vorschlag je Befund, `on delete cascade` von `docx_reviews`), neuer privater Storage-Bucket `docx_reviews` (gleiches Policy-Muster wie `pdfs`, Migration 0002).

**Zitations-Muster deckt exakt das ab, was das Tool selbst erzeugt:** Regex spiegelt `format_citation` (SQL-Funktion, Migration 0019) - "(Autor[, Autor2 | et al.], Jahr[a-z], S. Seite[-Seite])". Erkennt zuverlässig alles, was per Kopier-Button aus der Schreibwerkstatt in die Word-Datei gelangt ist; abweichend von Hand formatierte Zitationen werden nicht erkannt (dokumentierte Grenze, wie schon bei den BibTeX-Unmatched-Einträgen in Phase 4).

**Seiten-Tracking im Word-Dokument ist Best-Effort:** `.docx` kennt keine echten Seitenzahlen ohne Layout-Engine - genutzt werden manuelle Seitenumbrüche (`w:br type="page"`) und Word's `w:lastRenderedPageBreak` (Cache vom letzten Speichern, kann nach Bearbeitung leicht veralten). Fundstellen sind deshalb als „ca. S. X (Word)" gekennzeichnet, zusätzlich mit einem Kontext-Textausschnitt (Ctrl+F-tauglich) - kein Anspruch auf exakte Seitenzahl.

**Referenz-Matching zweistufig:** In-Text-Zitationen matchen exakt gegen die von `format_citation` erzeugte Autor-Zeichenkette (1 Autor / „A & B" / „A et al."); Literaturverzeichnis-Einträge (freieres Format, alle Autoren ausgeschrieben) matchen nur über den ersten Autor-Nachnamen + Jahr, gleiche Vereinfachung wie `apaFormat.ts::firstAuthorKey`. Mehrdeutige Autor+Jahr-Treffer im Text (bekannte Tool-Grenze, s. `docs/ideen-spaeter.md` „Autor+Jahr-Suffixe im Fließtext") werden als Warnung gemeldet, nicht geraten.

**Wörtliche Zitate:** Zitat unmittelbar vor der Zitation (gleiches Anführungsmuster wie `CitationCopyButtons.tsx`) wird gegen den vollständigen extrahierten Text der Quelle (`chunks.text`, nicht nur die erfassten Passagen) auf Substring-Ebene geprüft - „String-Verifikation", keine Fuzzy-Suche. Mit `[Übersetzung durch den Verfasser]`-Marker gekennzeichnete Zitate werden stattdessen gegen `passages.translation` geprüft (niedrigere Kategorie „Warnung" statt „Fehler", da Übersetzungen naturgemäß freier sind).

**Frontend:** dritter Tab „Prüfbericht" in `Protokolle.tsx` (kein neuer Sidebar-Eintrag - gleiche Begründung wie beim Chat in der Schreibwerkstatt: die `BottomTabBar` hat bereits 8 Einträge). Upload-Formular + Liste vergangener Prüfungen mit Status, Polling alle 4s solange eine Prüfung noch nicht fertig ist, Befunde nach Schweregrad sortiert mit Fundstelle/Kontext/Vorschlag je Karte.

**Getestet:** TypeScript-Build/`vite build` fehlerfrei. Python-Syntax- und Logik-Smoketest (Autor-Formatierung, Zitations-Regex). End-zu-Ende gegen die echte Produktions-DB (Testartefakte danach vollständig entfernt): ein synthetisches Test-Dokument mit fünf In-Text-Zitationen und vier Literaturverzeichnis-Einträgen, gebaut aus echten Quellen des Bestands (Kearns & Lederer 2003, Reynolds & Yetton 2015, Hanelt et al. 2021, Queiroz et al. 2020) plus einer erfundenen Quelle, gegen die echte DB geprüft - alle sechs bewusst eingebauten Fälle korrekt erkannt: unbelegbares wörtliches Zitat (Fehler), Seite außerhalb des Offset-Bereichs (Fehler), unbekannte Quelle (Fehler), im Text zitiert aber nicht im Verzeichnis (Fehler), Verzeichnis-Waise nie zitiert (Warnung), Verzeichnis-Eintrag nicht zuordenbar (Hinweis) - und die eine korrekt zitierte, korrekt platzierte, wörtlich nachweisbare Zitation blieb zu Recht unauffällig (kein falsch-positiver Befund). **Einschränkung:** Kein *echter* ISP-Entwurf des Autors verfügbar (kein Zugriff auf dessen Dateisystem/Word-Datei) - das Test-Dokument ist synthetisch, nutzt aber ausschließlich reale Bestandsdaten. Empfehlung: den echten ISP-Entwurf einmal selbst über den neuen „Prüfbericht"-Tab hochladen und den Worker-Befehl laufen lassen, um das Fertig-Kriterium mit einem echten Dokument zu bestätigen. Kein Browser-Klick-Test möglich (gleiche Login-Einschränkung wie bei Paket F).

## Paket 2 – Nachrecherche via OpenAlex ☑

- Such-Ansicht erhält Tab „Extern": Stichwort-/Themensuche direkt gegen OpenAlex (kostenlose API); Treffer mit Titel, Autoren, Jahr, Venue, Zitationszahl, Abstract.
- Abgleich mit eigenem Bestand: bereits vorhandene Treffer werden markiert („im Bestand"), verworfene ebenfalls („bereits verworfen am …", aus Paket E).
- Ein-Klick-Übernahme interessanter Treffer **in den Eingang/Prüf-Pool** (Paket E) – Open-Access-PDF wird, wo verfügbar, direkt mitgeladen; sonst Metadaten-Eintrag mit Kennzeichen `kein PDF`.
- **Fertig, wenn:** Eine externe Suche → Prüf-Pool → Übernahme durchgängig funktioniert.

**Notizen:**

**Kein Schema-Update nötig** - Import legt ganz normale `sources`-Zeilen mit `status='triage'` an, läuft dadurch automatisch in die bestehende Eingang/Prüf-Pool-Infrastruktur aus Phase 5, Paket E (Schnell-Einschätzung, Übernehmen/Verwerfen, Wiedererkennung) - keine neue Tabelle, kein neuer Status-Wert.

**Zwei neue, bewusst synchrone Edge Functions** (`openalex-search`, `openalex-import`, gleiches Muster wie `fetch-crossref-metadata`): externe API-Aufrufe laufen serverseitig, nicht direkt aus dem Browser - konsistent mit dem einzigen bisherigen externen-API-Aufruf aus dem Frontend (Crossref-Nachtrag auf der Quellen-Detailseite). Parsing-Logik (`_parse_work`) spiegelt bewusst `worker/littool_worker/openalex.py`, damit Worker-Enrichment und Nachrecherche identisch interpretieren. Neuer Secret `OPENALEX_MAILTO` für Edge Functions gesetzt (bisher nur als Worker-`.env`-Variable vorhanden, gleicher Wert übernommen).

**Architektur-Entscheidung PDF-Download (nicht mit dem Autor vorab abgestimmt, aber risikoarme technische Wahl, keine Kernarchitektur-Änderung):** Das Laden des Open-Access-PDFs passiert serverseitig in `openalex-import` (Deno `fetch` auf die von OpenAlex gelieferte PDF-URL, danach direkter Upload in den bestehenden `pdfs`-Bucket) statt im Browser - vermeidet CORS-Probleme mit beliebigen Verlags-Hosts und hält das bisherige Muster „Rohbytes verarbeiten passiert serverseitig" bei. Kein Widerspruch zur Paket-E-Entscheidung „rohe PDF-Bytes nur im Worker" - dort ging es um bereits vorhandene, zu extrahierende PDFs; hier wird nur roh heruntergeladen und abgelegt, nicht geparst.

**„Bereits im Bestand"/„bereits verworfen" ist hier abweichend von Paket E per DOI exakt möglich, nicht nur Titel-Fuzzy:** OpenAlex liefert die DOI schon in den Suchergebnissen selbst (anders als beim PDF-Direkt-Upload, wo die DOI erst nach der PDF-Verarbeitung bekannt ist) - `crossReferenceOpenAlexResults` prüft deshalb DOI exakt zuerst, Titel-Ähnlichkeit (wiederverwendet aus `lib/triage.ts::titleSimilarity`, jetzt exportiert statt modul-privat) nur als Fallback. Der Bestand-Abgleich fragt bewusst ALLE Quellen ab (kein `status<>'triage'`-Filter wie in `fetchSources()`) - ein bereits im Eingang wartender Kandidat soll nicht ein zweites Mal importierbar wirken.

**Open-Access-PDF real getestet, publisherabhängig:** Ein erster Test gegen eine MDPI-URL scheiterte mit HTTP 403 (Bot-Schutz blockiert serverseitige Anfragen unabhängig vom User-Agent) - das ist der im Plan selbst vorgesehene „kein PDF"-Fall, korrekt und sichtbar als `pdfError` gemeldet, `sources`-Zeile trotzdem sauber als Metadaten-Eintrag angelegt. Test gegen eine arXiv-URL (permissiverer Host) danach erfolgreich: PDF (2,6 MB, gültiger `%PDF-`-Header) korrekt im `pdfs`-Bucket abgelegt, `storage_path` gesetzt.

Live gegen die echte Produktions-DB/Functions getestet (Testartefakte danach vollständig entfernt): (1) `openalex-search` mit einer echten Fachfrage („business IT alignment digital transformation insurance") - 25 echte Treffer mit korrekt geparsten Feldern (Titel, Autoren, Jahr, Venue, Zitationszahl, Abstract, Open-Access-PDF-URL wo vorhanden). (2) `openalex-import` zweimal getestet: MDPI-Kandidat (403, „kein PDF" korrekt gemeldet) und arXiv-Kandidat (PDF erfolgreich geladen und gespeichert, per Direktdownload aus dem Bucket verifiziert). Beide Importe legten korrekt eine `status='triage'`-Zeile mit allen Metadatenfeldern an. TypeScript-Build/`vite build` fehlerfrei. **Kein Browser-Klick-Test möglich** (gleiche Login-Einschränkung wie Paket F/1) - die Bestand-/Verworfen-Abgleichslogik (`crossReferenceOpenAlexResults`) selbst ist reiner, bereits typgeprüfter Code ohne eigenen Netzwerk-Call und wiederverwendet die in Paket E bereits gegen echte Daten getestete `titleSimilarity`-Heuristik; sie wurde nicht zusätzlich per Browser-UI bestätigt.

## Paket 3 – Exporte: BibTeX, Methodentabelle, Deskriptionsmatrix ☑ (Deskriptionsmatrix-Export zurückgestellt)

- BibTeX-Export: gesamter Bestand oder nur verwendete Quellen des aktiven Dokuments (.bib-Download) – macht den Bestand portabel (kein Lock-in).
- Methodentabelle: Quellen × Methodenprofil (Studientyp, Methode, Sample, Auswertung) als kopierbare Word-Tabelle und CSV; Filter wie in der Bibliothek.
- ~~Deskriptionsmatrix: kombinierbare Spalten (Ranking, Methodenprofil, Relevanz je FF, Themenfelder) als Export für den Literaturreview-Teil der Arbeit.~~ **Zurückgestellt (Entscheidung des Autors im Chat, 2026-07-28):** Naming-Kollision mit der bereits bestehenden Deskriptionsmatrix-Ansicht (Synthese-Tabelle mit Einordnung/Fundierung/Stichprobe/Analysemethode/Erkenntnisse, Checkbox-Auswahl für die Evaluationsmatrix, bereits mit CSV-Export seit Phase 3/4) im Chat angesprochen und zur Entscheidung vorgelegt - Antwort: „so wie wir sie haben reicht das erstmal aus", die bestehende Ansicht bleibt unverändert, der neue kombinierbare-Spalten-Export wird nicht gebaut.
- **Fertig, wenn:** Alle drei Exporte in Word eingefügt sauber aussehen.

**Notizen:**

**BibTeX-Export:** neue `lib/bibtex.ts`, zwei Einstiege - „BibTeX (gesamter Bestand)" in der Bibliothek (`fetchAllSourcesForBibtex`, gleicher `triage`-Ausschluss wie überall), „BibTeX (verwendete Quellen)" in der `LiteraturverzeichnisSection` von `Verwendet.tsx` (gleiches Join-Muster wie `lib/literatureList.ts::fetchUsedSources`, nur mit den zusätzlich für BibTeX nötigen Feldern volume/issue/pages/doi/issn/url). Typ-Mapping `journal→article, konferenz→inproceedings, buch→book, dissertation→phdthesis, grau→misc`; Zitierschlüssel `familie+jahr+erstesTitelwort`, bei Kollision innerhalb eines Exports mit a/b/c… aufgelöst (am echten Bestand geprüft: zwei Werke „Reinheimer 2017" bekamen korrekt unterschiedliche Schlüssel).

**Methodentabelle:** neue Komponente `components/MethodentabelleTab.tsx`, als dritter interner Tab in der Bibliothek (kein neuer Sidebar-Eintrag - gleiche Begründung wie Prüfbericht/Extern: die `BottomTabBar` hat bereits 8 Einträge, `fetchAllMethodProfiles` neu in `lib/methodProfiles.ts`). Filter wie in der Bibliothek (Typ, Ranking, Themenfeld) plus zusätzlich Studientyp, da dieser selbst eine Spalte der Tabelle ist. Neue geteilte Helfer `lib/copyTable.ts` (`copyTableToClipboard`, `downloadCsv`) - HTML+Text-Clipboard-Muster wie `views/Protokolle.tsx::copyAsTable`, bewusst eigenständig statt Protokolle.tsx umzubauen (kleiner, in sich geschlossener Helfer, kein Refactoring-Risiko an bestehendem Code für dieses Paket).

**Getestet:** TypeScript-Build/`vite build` fehlerfrei. BibTeX-Erzeugung als eigenständiger Node-Smoketest gegen echte Bestandsdaten (Buch-, Dissertations-/Phdthesis- und Journal-Artikel-Typen, insgesamt 14 reale Quellen über mehrere Typen) - alle Einträge syntaktisch korrektes BibTeX, Feld-Mapping je Typ (journal/venue/volume/number/pages bzw. school bzw. publisher) korrekt, Kollisions-Suffix live bestätigt. Methodentabelle-Datenmodell gegen eine echte Direktabfrage bestätigter `method_profiles` samt Join auf `sources` geprüft - Studientyp/Methode/Datengrundlage/Auswertungsverfahren korrekt zugeordnet, inkl. Sonderfall „nicht_anwendbar"/konzeptionell mit leeren Methodenfeldern. **Kein Browser-Klick-Test möglich** (gleiche Login-Einschränkung wie F/1/2) - insbesondere der eigentliche Wortdokument-Einfüge-Test aus dem Fertig-Kriterium ("in Word eingefügt sauber aussehen") konnte nicht durchgeführt werden; die kopierte Tabelle nutzt aber dasselbe bereits in Phase 4 etabliente HTML-Clipboard-Muster wie das Literaturverzeichnis und die KI-Verzeichnis-Tabelle in Protokolle, die dort bereits als Word-tauglich dokumentiert sind.

---

## Zwischendurch erledigt (außerhalb der Paket-Reihenfolge, auf direkten Wunsch im Chat, 2026-07-28)

Zwei Ad-hoc-Änderungen, die der Autor direkt im Chat angefragt hat (kein eigenes Paket, keine Bedarfs-Priorisierung nötig - direkte Anweisung):

1. **Spalten der Relevanz-Matrix verschiebbar/sortierbar** (`components/RelevanceMatrix.tsx`, in der Forschungsfragen-Ansicht): alle Spalten (Autor/Jahr, Titel, Ranking, Studientyp, je Forschungsfrage) per Drag&Drop umsortierbar (Reihenfolge in `localStorage` gespeichert, überlebt neu hinzukommende Forschungsfragen durch Anhängen ans Ende), jede Spalte per Klick auf den Header sortierbar (ersetzt das bisherige Titel/Relevanz-Dropdown durch das aus der Deskriptionsmatrix bekannte Klick-Header-Muster). CSV-Export folgt jetzt ebenfalls der aktuellen Spaltenreihenfolge.
2. **Schreibwerkstatt-Sitzungszustand über Routenwechsel hinweg erhalten** (`views/Schreibwerkstatt.tsx`): Ausgewählter Abschnitt, aufgeklappte Baumknoten, Modus (Abschnitte/Chat) und ein noch ungespeicherter Entwurf (Editier-Text, Cursor-Position, Marker-Zuordnung) werden fortlaufend in `sessionStorage` gesichert und beim erneuten Öffnen der Ansicht automatisch wiederhergestellt - vorher unmountete die Komponente bei jedem Routenwechsel komplett und der Zustand ging verloren. Bewusst `sessionStorage` (überlebt die Browser-Sitzung, aber nicht das Schließen des Tabs) statt `localStorage` - reiner Wiedereinstiegs-Komfort, keine dauerhafte Einstellung. Der wiederhergestellte Entwurf wird nur einmalig konsumiert, ein regulärer Abschnittswechsel danach setzt wie bisher zurück.

**Getestet:** TypeScript-Build/`vite build` fehlerfrei für beide Änderungen. Kein Browser-Klick-Test möglich (gleiche Login-Einschränkung wie bei den Phase-6-Paketen zuvor) - insbesondere der Drag&Drop-Spaltentausch und das tatsächliche Wiederherstellen nach einem echten Routenwechsel konnten dadurch nicht visuell bestätigt werden, nur die zugrundeliegende Logik (Spalten-Merge, Sortierfunktionen, Session-Restore-Bedingungen) wurde per Code-Review sorgfältig geprüft.

### Aufräumrunde (2026-07-28, Autor jetzt im Browser eingeloggt - erstmals echte UI-Tests in dieser Session möglich)

Auf Wunsch des Autors ("räume die offenen Punkte einmal so gut es geht auf") ein Durchgang durch dokumentierte Altlasten + zwei konkrete Wünsche (asynchrone Verarbeitung erklären, hilfreiche Hinweise ergänzen):

1. **Bibliothek: Hinweis für asynchrone Verarbeitung** - neuer Banner „⏳ N in Verarbeitung – wartet auf nächsten Worker-Lauf, kein Fehler" (gleiches Muster wie die bestehenden Extraktionsfehler-/QS-Banner), zusätzlich Tooltip an der einzelnen Statuszelle. Adressiert direkt die Rückmeldung des Autors: „man weiß sonst nicht, ist das ein Fehler oder braucht das nur Zeit".
2. **Mobiler `BottomTabBar`-Seitenoverflow behoben** (seit Phase 2/3 dokumentiert, nie gefixt): Ursache war `flex-1` auf acht gleich breiten Spalten, die bei 375px nicht hineinpassten - der Überlauf zog die gesamte Seite in die Breite statt nur die Leiste. Fix: Leiste bekommt `overflow-x-auto`, Einträge `shrink-0` mit fester Breite statt `flex-1` - live verifiziert (`document.documentElement.scrollWidth` jetzt exakt 375 bei 375px Viewport, die Leiste selbst scrollt intern bei Bedarf).
3. **Vier konkrete Datenqualitäts-Fixes** an real identifizierten Quellen (per SQL-Scan nach unplausiblen Jahren, doppelten Titelsubstrings, verdächtig langen Autoren-Feldern gezielt gesucht, keine geraten):
   - `f8f3b1dc…` (Jonathan et al.): Jahr `22` → `2022` (Titel nennt "BIR 2022 Workshops").
   - `82c0f29e…` (Nissen & Termer): Jahr `-1` → `2014` (aus der DOI abgeleitet), Titel entdoppelt (war zweimal hintereinander gespeichert), DOI-Feld von vollständiger URL auf reine DOI gekürzt (war zuvor inkonsistent zum Rest des Bestands - hätte in `apaFormat.ts::doiSuffix` zu einer doppelt verschachtelten URL geführt).
   - `27d04943…` (Henderson & Venkatraman 1990): korrupte Autoren-Felder (`given: "hn Henderson N."`) korrigiert auf `J. C.`/`N.` - abgeglichen mit der bereits im Bestand vorhandenen 1993er Version desselben Autorenpaars.
   - `2f3dd03e…` (Henderson & Venkatraman 1993): dateinamen-artiger Titel `"Strategic_alignment_Leveraging_informati"` korrigiert auf den echten Titel des bekannten Aufsatzes.
   - Die zwei ursprünglich in Phase 4 dokumentierten Fixes „Charoensuk Issue-Feld" und „Völzow given/family vertauscht" waren bei Prüfung bereits korrekt/anders - vermutlich durch eine spätere Re-Anreicherung überschrieben, keine Aktion mehr nötig.
   - Weitere, dateinamen-artige Titel (z. B. "FactorsthatInfluencetheSocialDimensionMISQ2000") bewusst **nicht** angefasst - ohne verlässliche externe Quelle für den echten Titel wäre eine Korrektur geraten, nicht belegt.
4. **Erklärender Hinweis ergänzt:** „Debatte starten" nannte bislang nur den Grund „kein Entwurf", nicht aber die zweite, ebenso stumm blockierende Bedingung (2–3 Personas nötig) - neuer Hinweistext „Genau 2 oder 3 Personas auswählen." ergänzt.

**Getestet:** TypeScript-Build/`vite build` fehlerfrei. **Erstmals in dieser Session per echtem Login im Browser statt nur Code-Review verifiziert:** Bibliothek/Methodentabelle/BibTeX-Export/Suche-Extern-Tab/Prüfbericht-Tab laden sichtbar korrekt; mobiler Seitenoverflow live bei 375px reproduziert und der Fix live bestätigt (`scrollWidth` vorher 540, nachher 375, Leiste selbst bleibt intern scrollbar mit `scrollWidth 512 > clientWidth 375`). Alle vier Datenfixes per Direktabfrage vor und nach der Änderung verifiziert; `passages.citation`-Sync-Trigger geprüft (keine bestehenden Passagen an den betroffenen Quellen, daher kein Nachzieh-Bedarf). Debatte-Hinweis nicht live nachgestellt (kein Entwurf im getesteten Abschnitt vorhanden), nur per Code-Review geprüft.

**Offen, braucht eine Entscheidung/Aktion des Autors (nicht angefasst):**
- ~~Zwei vermutete Duplikate im Bestand (Reinheimer/Robra-Bissantz „Business-IT-Alignment").~~ **Erledigt (2026-07-29):** Autor bestätigte die Dublette - die Version ohne extrahierte Zitate (`a9b67153…`) wurde gelöscht, die Version mit 9 bestätigten Zitaten (`fd100f96…`) bleibt.
- 28 unmatched BibTeX-Einträge aus dem Citavi-Import (Phase 3/4) warten weiterhin auf manuelle Durchsicht.
- Restore-Test des Backups (`backups/20260726_221744`) noch nicht bestätigt.
- QS-Prüf-Rückstand (`/pruefen`): weiterhin nur ein Bruchteil der Passagen bestätigt - eigentliche Schreibarbeit des Autors, keine Engineering-Aufgabe.

### Themenfeld/Funktion direkt am Zitat (Autorenwunsch, 2026-07-29, Schritt 1 von 2)

Hintergrund: Der Autor arbeitet überwiegend paraphrasierend/zusammenfassend, wörtliche Zitate sind die Ausnahme - Themenfeld/Funktion sollten deshalb direkt am einzelnen markierten Textabschnitt zuordenbar sein, nicht nur an der ganzen Quelle (bisher: `source_topics`/`source_functions`). Schritt 2 (Schreibwerkstatt-Layout: größere Entwurf-Spalte, drei Funktions-Chips, Diskussion volle Breite unten, schlankerer Editor) folgt in einer eigenen Sitzung.

**Migration `0041_passage_tags.sql`:** neue Tabellen `passage_topics`/`passage_functions` (passage_id + topic_id bzw. function_id), gleiches Muster wie `section_topics`/`section_functions` (Migration 0032/0039) - direkte, vom Autor gesetzte Verknüpfung, bewusst **kein** `confirmed`-Feld (anders als `source_topics`/`source_functions`, die KI-Vorschläge sind).

**`lib/passageTags.ts`:** Batch-Fetch (`fetchPassageTagsForPassages`) und Toggle-Funktionen, gleiches Muster wie `lib/sections.ts`. In `QuellenDetail.tsx` (dort, „wo aktuell die Zitate sind") bekommt jede bestätigte Zitat-Karte zusätzlich zwei Chip-Reihen (Themenfelder, Funktion) - Übersetzung/Paraphrase-Logik bleibt unverändert, die läuft schon wie gewünscht.

**Zitat-Pool-Filter erweitert** (`lib/sectionPool.ts`): `fetchConfirmedPassagesPool` lädt jetzt zusätzlich `passage_topics`/`passage_functions` und **vereinigt** sie mit den Quellen-Tags (nicht ersetzt) - ein Zitat passt in den Pool eines Abschnitts, wenn FF, Quellen-Topic, Quellen-Funktion, **oder** Zitat-Topic, **oder** Zitat-Funktion übereinstimmt.

**Getestet, live gegen die echte Produktions-DB (nach Login des Autors im Browser):** Eine reale Quelle (Reinheimer, 9 bestätigte Zitate) direkt getaggt, danach live in der Schreibwerkstatt bestätigt - der Abschnitt „Business-IT Alignment im Kontext der digitalen Transformation" (verknüpft mit Themenfeld „Digitale Transformation", aber nicht mit der Forschungsfrage des Zitats) zeigte das getaggte Zitat korrekt im Zitat-Pool. **Dabei eine zweite, vom aktuellen Feature unabhängige Datenqualitäts-Auffälligkeit gefunden:** dieselbe Quelle enthielt zwei Zitat-Zeilen mit identischem Wortlaut („BITA describes the adjustment…", unterschiedliche `id`, an zwei unterschiedliche Forschungsfragen HFF/TSFF2 gehängt) - kein reines Kopier-Duplikat, sondern zwei FF-Bezüge desselben Zitats über zwei Zeilen (Schema erlaubt nur eine FF pro Zeile). Auf Anweisung des Autors die HFF-Version gelöscht, TSFF2-Version bleibt. Alle Test-Verknüpfungen (`passage_topics`) danach wieder vollständig entfernt. TypeScript-Build/`vite build` fehlerfrei.

### Schritt 2: Schreibwerkstatt-Layout (2026-07-29)

Umsetzung wie in der Rückfrage besprochen: Entwurf-Spalte größer (Default 65/35 statt gleich breit), daneben eine schmalere Zitat-Pool-Spalte mit den drei Funktions-Chips (Einleitung/Problemstellung, Methodik, Themenfeld-Literatur) als Schnellfilter, Diskussion darunter über die volle Breite statt als dritte Spalte rechts, Entwurf-Textarea optisch aufgewertet (größere Schrift, `leading-relaxed`, mehr Padding) - bewusst kein Rich-Text, nur die zuvor abgestimmte optische Verbesserung.

**`columnWidths`** (Paket F) von drei auf zwei Werte reduziert (nur noch Entwurf/Zitat-Pool teilen sich eine Zeile, Diskussion ist keine Spalte mehr) - alter dreiwertiger `localStorage`-Inhalt wird beim Laden erkannt und verworfen (Längen-Check), fällt sauber auf den neuen 65/35-Default zurück, kein Migrationscode nötig.

**Funktions-Chip-Filter im Zitat-Pool** (`ZitatPoolColumn`): neuer State `poolFunctionFilter`, unabhängig von „alle anzeigen" - filtert die jeweils sichtbare Liste zusätzlich auf eine der drei Funktionen (matcht `passage.function_ids`, das seit Schritt 1 sowohl Quellen- als auch Zitat-Ebene enthält). Wird beim Abschnittswechsel wie „alle anzeigen" zurückgesetzt.

**Mobile Ansicht bewusst unverändert gelassen:** die Tab-Reihenfolge (Entwurf/Zitat-Pool/Diskussion) entspricht bereits dem gewünschten „Entwurf im Fokus, Diskussion separat" - keine Umstrukturierung nötig, die neuen Funktions-Chips erscheinen dort automatisch mit (gleiche `ZitatPoolColumn`-Komponente).

**Echter Testfehler beim Verifizieren gefunden und korrigiert:** Beim ersten Live-Test wurde versehentlich nicht der neue Pool-Filter-Chip angeklickt, sondern der gleich gestylte, bereits bestehende Abschnitts-Funktion-Chip (Paket F.1, oberhalb in der „Übergeordneter Abschnitt…"-Sektion) - beide verwenden dieselben CSS-Klassen und denselben Text, ein einfacher `document.querySelectorAll('button')`-Text-Treffer traf den falschen. Dadurch wurde der Abschnitt „1 Einleitung" versehentlich zusätzlich mit der Funktion „Methodik" verknüpft - bemerkt, weil zwei Buttons mit Text „Methodik" gleichzeitig sichtbar waren, korrigiert (Verknüpfung wieder entfernt), danach mit einer auf den Zitat-Pool-Container eingeschränkten Suche sauber gegengetestet: Filter zeigt korrekt nur Zitate mit der gewählten Funktion, „Keine Zitate mit dieser Funktion" bei keinem Treffer.

**Getestet, live im Browser (Desktop 1400px und Mobil 375px):** Layout entspricht dem Screenshot-Vergleich (Entwurf groß + Zitat-Pool mit drei Chips oben, Diskussion volle Breite unten, per Direktmessung bestätigt: Diskussion-Zeile exakt so breit wie die gesamte Sektion). Funktions-Filter korrekt getestet (s. o., inkl. Korrektur des eigenen Testfehlers). Mobiler Seiten-Overflow weiterhin nicht reproduzierbar (`scrollWidth === innerWidth === 375`). TypeScript-Build/`vite build` fehlerfrei.

### Ad-hoc: Zitat manuell hinzufügen – Seite automatisch übernehmen + Formular näher an den PDF-Viewer (2026-07-29)

Anlass: Rückfrage des Autors, wie man in der Bibliothek markierten/kopierten Text ablegt - das bestehende Formular „Zitat manuell hinzufügen" existierte bereits, war aber unten in der Zitate-Karte versteckt und verlangte die Seitenzahl von Hand.

**`QuellenDetail.tsx`:** Neuer `useEffect(() => { setManualPage(String(pageJump)) }, [pageJump])` - das Seite-Feld des manuellen Formulars übernimmt automatisch die gerade im PDF-Viewer angezeigte Seite, bleibt aber weiterhin frei überschreibbar. Das Formular selbst wurde aus der Zitate-Karte herausgelöst und in eine eigene Karte „Neuen Textabschnitt hinzufügen" verschoben, direkt unter dem PDF-Viewer (statt darunter, nach der Zitate-Liste) - näher an der Stelle, wo der Text tatsächlich gelesen/kopiert wird.

**Getestet, live im Browser:** Sprung zu PDF-Seite 5 über die bestehende Seite-Springen-Funktion übernommen - das Seite-Feld der neuen Karte zeigte danach korrekt „5". Karte erscheint an der richtigen Stelle, keine Dopplung des Formulars. TypeScript-Build/`vite build` fehlerfrei.

**Regression im selben Zug behoben:** Das Seite-Feld hatte nur einen Placeholder-Text („Seite"), der verschwindet, sobald ein Wert eingetragen ist - durch die neue Vorausfüllung war die Beschriftung dadurch nie mehr sichtbar. Alle drei Felder (Forschungsfrage, Seite, Relevanz) haben jetzt feste, dauerhaft sichtbare `<label>`-Beschriftungen statt Placeholder.

### Ad-hoc: Themenfeld/Funktion direkt beim Anlegen eines Textabschnitts + Relevanz-Feld entfernt (2026-07-29)

Anlass: Rückfrage-Diskussion mit dem Autor zum Sinn der Forschungsfrage-/Relevanz-Felder beim manuellen Erfassen. Ergebnis der Diskussion: Themenfeld/Funktion sind die eigentlich relevante Einordnung fürs Schreiben (nicht die Forschungsfrage direkt, die nur noch für die separate Forschungsfragen-Ansicht/Relevanzmatrix gebraucht wird), Relevanz wird nirgends im Schreib-Flow ausgewertet, und eine direkte Bindung an einen Gliederungspunkt wurde bewusst verworfen (Gliederung ändert sich strukturell - Themenfeld/Funktion sind die stabilere, bereits vorhandene Abstraktionsebene, s. [[Schritt 1]] oben).

**Kein Schema-Eingriff nötig:** `manualRqId` defaultet bereits (unverändert seit der letzten Änderung) auf die erste Forschungsfrage nach `sort_order`, also HFF - für Inhalte ohne klaren Bezug zu einer Teil-Forschungsfrage (z. B. Einleitungsmaterial) bleibt das Feld dadurch meist unangetastet korrekt, ohne dass `research_question_id` (weiterhin `not null`) gelockert werden müsste. `relevance` bleibt ebenfalls `not null check (1-3)` in der DB - das Feld wird nur nicht mehr in der Oberfläche abgefragt, sondern beim manuellen Anlegen fest auf `2` gesetzt (`QuellenDetail.tsx::handleManualSubmit`).

**`QuellenDetail.tsx`:** Neuer lokaler State `manualTopicIds`/`manualFunctionIds` (nur für die Erfassungskarte, unabhängig von den bestehenden `passageTopicsByPassage`/`passageFunctionsByPassage`-Maps der gespeicherten Zitate) mit Toggle-Funktionen `toggleManualTopic`/`toggleManualFunction`. Dieselben Chip-Reihen wie unten bei den gespeicherten Zitaten, nur lokal statt DB-gebunden, da die Passage beim Anlegen noch keine `id` hat. `handleManualSubmit` verknüpft nach dem erfolgreichen `addManualCitation`-Aufruf die gewählten Chips per `togglePassageTopic`/`togglePassageFunction` mit der neu erzeugten Passage-`id` und setzt die lokale Auswahl danach zurück.

**Getestet, live gegen die echte Produktions-DB (Quelle Reinheimer):** Testabschnitt mit Themenfeld „Digitale Transformation" und Funktion „Methodik" angelegt, per SQL verifiziert - `relevance=2`, `research_question_id` = HFF, `passage_topics`/`passage_functions` korrekt verknüpft. Danach vollständig entfernt (cascadierte Verknüpfungen mitgelöscht). TypeScript-Build/`vite build` fehlerfrei.

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
