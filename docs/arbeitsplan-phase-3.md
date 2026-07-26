# Arbeitsplan Phase 3 – Forschungsfragen, Analyse & Passagen

Ziel der Phase: Thema, Forschungsfragen und Themenfelder sind im Tool hinterlegt. Jede Quelle ist thematisch eingeordnet, hat ein Methodenprofil und extrahierte Passagen (Original + Übersetzung + Zitation) je Forschungsfrage. Forschungsfragen-Ansicht, Matrix, QS-Workflow und Paraphrase-Funktion stehen.

Voraussetzung: Phase 2 abgeschlossen (Bestand gechunkt, eingebettet, durchsuchbar).

**Entscheidung Übersetzung (Vorschlag, im Paket 4 umgesetzt):** Passagen werden bei der Extraktion sofort mitübersetzt (kurz, Kosten minimal, beste UX). Volltexte nur on demand. Kein Vorab-Übersetzen ganzer Dokumente.

---

## Paket 0 – Rückblick & KI-Grundlagen ☑

- Offene Punkte aus Phase 2 checken (Extraktions-Fehlerfälle, Suchqualität).
- Zentrale Claude-API-Hilfsschicht im Worker: einheitlicher Aufruf, Retry, Kosten-Zählung pro Job.
- **Fertig, wenn:** Ein Test-Prompt läuft über die Hilfsschicht und protokolliert Tokens/Kosten.

**Notizen:**

*Offene Punkte aus Phase 2 (Stand geprüft, unverändert gegenüber `docs/notizen-phase-1-2.md`):*
- 2 Quellen weiterhin `extraction_status = extraction_failed` (Springer-Duplikate, DOI 10.1007/BF03353515) - unreparierbarer Font-Encoding-Defekt, kein Fix möglich, bleibt so markiert.
- Vermutete Dublette `a9b67153…`/`fd100f96…` ("Business-IT-Alignment") weiterhin unentschieden - wartet auf Nutzer-Entscheidung, nicht selbst zusammengeführt.
- 88 Quellen `needs_review`, CORE-Rankingliste fehlt weiterhin, keine Lösch-/Merge-Funktion, Worker läuft weiterhin nur lokal - alles bekannte, dokumentierte Grenzen ohne neuen Handlungsbedarf für Phase 3.
- Suchqualität (Paket 8/9 Phase 2) keine neuen Auffälligkeiten seit Abschluss.

Kein kritischer Fund - alle offenen Punkte sind bereits dokumentiert und bewusst zurückgestellt.

*Claude-API-Hilfsschicht:* `worker/littool_worker/claude_client.py` - `call()` kapselt `messages.create()` einheitlich für alle künftigen Worker-Jobs. Modell `claude-sonnet-4-6` (CLAUDE.md-Vorgabe), `output_config.effort` parametrisierbar (Default `medium` - Klassifikations-/Extraktionsaufgaben der folgenden Pakete brauchen kein `high`/`xhigh`, schlank bleiben). Retry bei Rate-Limits/5xx läuft über den SDK-eigenen Mechanismus (`max_retries`), Verbindungs-/Statusfehler werden als sichtbare `RuntimeError` mit Klartext weitergereicht statt verschluckt. Kosten-Zählung: optionales `stats`-dict im gleichen Muster wie `embeddings.run_embedding` (`tokens_in`, `tokens_out`, `kosten_usd`) - Grundlage für die `AiLogEntry`-Einträge ab Paket 1. Test über neuen CLI-Befehl `littool-worker test-claude`: Ein Beispiel-Prompt lief durch, Tokens und Kosten wurden korrekt protokolliert.

## Paket 1 – Schema: Analyse-Entitäten ☐

- Migration: `research_questions` (kürzel, text, sortierung), `topics`, `source_topics` (n:m), `passages` (source_id, page, original, translation, paraphrase, rq_id, relevance 1–3, citation, confirmed), `ai_log_entries` (datum, art, bezug, kurzbeschreibung, tokens).
- Relevanz an `source_topics` bzw. je Quelle-FF-Paar (für die Matrix): Tabelle `source_rq_relevance` (source_id, rq_id, relevance 0–3, begründung, confirmed).
- **Fertig, wenn:** Migration läuft, Beziehungen per SQL testbar, RLS greift.

## Paket 2 – Einstellungen: Thema, FFs, Themenfelder ☐

- Einstellungs-Ansicht: Dissertationsthema (Freitext), Forschungsfragen (FF1…FFn, sortierbar), Themenfelder (Name + Kurzbeschreibung) anlegen/bearbeiten.
- Die echten Forschungsfragen und Themenfelder der Arbeit eintragen (Autor liefert sie in der Sitzung).
- **Fertig, wenn:** Reale FFs und Themenfelder sind im Tool und werden von der Pipeline gelesen.

## Paket 3 – Analyse-Pipeline: Themen & Relevanz ☐

- Worker-Job je Quelle: Claude erhält Metadaten + Abstract + repräsentative Chunks und liefert strukturiert (JSON): zugeordnete Themenfelder (mehrere erlaubt), Relevanz 0–3 je Forschungsfrage mit Ein-Satz-Begründung.
- Ergebnisse als `unbestätigt` speichern; jeder Lauf erzeugt AiLog-Einträge.
- Batch-fähig mit Wiederaufnahme; Kosten je Quelle loggen.
- **Kalibrierung zuerst:** Pipeline an 5 gut bekannten Quellen laufen lassen, Ergebnis manuell mit eigener Einschätzung vergleichen, Prompt nachschärfen – erst dann weiter.
- **Fertig, wenn:** Die 5 Kalibrier-Quellen plausibel zugeordnet sind und der Autor die Zuordnungen überwiegend teilt.

## Paket 4 – Passagen-Extraktion + Übersetzung ☐

- Worker-Job je Quelle × relevanter FF (Relevanz ≥ 1): Claude erhält die passenden Chunks (semantische Vorauswahl aus Phase 2) und extrahiert wörtliche Passagen: Originaltext exakt, Seite, Relevanz 1–3.
- Kontrolle: Extrahierter Text muss im Chunk-Text nachweisbar sein (String-Abgleich mit Toleranz) – verhindert erfundene Zitate. Nicht verifizierbare Passagen werden verworfen und geloggt.
- Direkt mitliefern: deutsche Übersetzung + fertige Zitation (Autor, Jahr, S. x).
- **Fertig, wenn:** Für die 5 Kalibrier-Quellen stimmen Passagen, Seiten und Zitationen bei manueller Prüfung im PDF.

## Paket 5 – Methodenprofil-Extraktion ☐

- Worker-Job je Quelle: Studientyp (qualitativ/quantitativ/mixed/konzeptionell/Review), Methode, Datengrundlage/Sample, Auswertungsverfahren – strukturiert, mit Fundstellen-Hinweis (Seite des Methodenteils), als `unbestätigt`.
- Graue Literatur: Studientyp „nicht anwendbar" zulässig.
- **Fertig, wenn:** 5 Kalibrier-Quellen korrekt profiliert; Anzeige auf der Quellen-Detailseite inkl. Bestätigen-Button.

## Paket 6 – QS-Workflow ☐

- Prüf-Ansicht (in Bibliothek und FF-Ansicht erreichbar): alle unbestätigten Zuordnungen, Relevanzen, Passagen, Methodenprofile als Karten – bestätigen, korrigieren (Relevanz ändern, Thema entfernen/ergänzen, Passage bearbeiten/löschen).
- Zähler „n unbestätigt" als Badge; Korrekturen setzen `confirmed`.
- **Fertig, wenn:** Ein kompletter Quellen-Durchlauf lässt sich in wenigen Minuten prüfen; mobil bedienbar.

## Paket 7 – Forschungsfragen-Ansicht ☐

- UI gemäß Wireframe: FF-Liste mit Passagen-Zähler links, Passagen-Karten rechts (Sterne, Original einklappbar, Übersetzung, Zitation kopieren, PDF-Sprung, ¶, 💬-Platzhalter für Phase 5).
- Sortierung (Relevanz/Quelle/Jahr), Filter (Thema, Ranking, Studientyp, nur bestätigte).
- **Fertig, wenn:** Pro FF entsteht ein brauchbarer Arbeitsüberblick, mobil wie Desktop.

## Paket 8 – Matrix-Ansicht ☐

- Matrix Quellen × Forschungsfragen, Zellen = Relevanz (leer/•/••/•••), Zeilen sortier-/filterbar (Ranking, Studientyp), Klick auf Zelle öffnet die Passagen.
- Export als CSV/kopierbare Tabelle (Vorstufe zur Deskriptionsmatrix, inkl. Spalten Methodenprofil + Ranking).
- **Fertig, wenn:** Die Matrix des echten Bestands lesbar ist und der Export in Word/Excel einfügbar aussieht.

## Paket 9 – Paraphrase-Funktion ☐

- ¶-Button an Passagen-Karten (und Textauswahl auf der Quellen-Detailseite): Claude paraphrasiert, Ergebnis erscheint als Vorschlag unter dem Original mit Zitation (Autor, Jahr, S. x).
- Übernahme per Klick speichert die Paraphrase an der Passage; verwerfen möglich; jede Paraphrase → AiLog.
- **Fertig, wenn:** Markieren → Paraphrase → prüfen → übernehmen funktioniert flüssig, auch mobil.

## Paket 10 – Backfill & Kalibrier-Abschluss ☐

- Analyse (Pakete 3–5) über den gesamten Bestand laufen lassen; Kosten notieren.
- QS-Durchgang: mindestens die Quellen mit hoher Relevanz vollständig bestätigen.
- Stichproben-Ehrlichkeitstest: 10 zufällige Passagen im PDF verifizieren (Text, Seite, Zitation).
- **Fertig, wenn:** Der Bestand ist analysiert, die wichtigsten Zuordnungen sind bestätigt → Phase 3 abgeschlossen. 🎉

---

## Danach

Arbeitsplan Phase 4 (Zitat-Häkchen, Verwendet-Ansicht, Literaturverzeichnis-Generator, KI-Verzeichnis-Export, Aktivitätslog) im Chat erstellen – der kleinste Plan, danach kommt die Schreibwerkstatt.
