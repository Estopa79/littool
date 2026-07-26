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

## Paket 1 – Schema: Analyse-Entitäten ☑

- Migration: `research_questions` (kürzel, text, sortierung), `topics`, `source_topics` (n:m), `passages` (source_id, page, original, translation, paraphrase, rq_id, relevance 1–3, citation, confirmed), `ai_log_entries` (datum, art, bezug, kurzbeschreibung, tokens).
- Relevanz an `source_topics` bzw. je Quelle-FF-Paar (für die Matrix): Tabelle `source_rq_relevance` (source_id, rq_id, relevance 0–3, begründung, confirmed).
- **Fertig, wenn:** Migration läuft, Beziehungen per SQL testbar, RLS greift.

**Notizen:**

Migration `0014_analyse_schema.sql`. Spaltennamen konsequent englisch (`code`/`question`/`sort_order` statt `kürzel`/`text`/`sortierung`, `description` statt `kurzbeschreibung`, `reasoning` statt `begründung`, `action_type` statt `art`) - Konvention aus CLAUDE.md. `source_topics` bewusst ohne Relevanzwert: Relevanz hängt an der Forschungsfrage, nicht am Themenfeld, deshalb ausschließlich in `source_rq_relevance` (0–3, Grundlage der Matrix) - `passages.relevance` ist 1–3, weil Passagen laut Paket 4 erst ab Relevanz ≥ 1 extrahiert werden. `ai_log_entries` deckt in dieser Phase nur Quellen-/Passagen-Bezug ab (`source_id`/`passage_id`, mindestens eins Pflicht); `section_id` für die Schreibwerkstatt kommt erst mit Phase 5 per eigener Migration dazu, genau wie `extraction_status` in Phase 2 nachträglich ergänzt wurde statt vorgebaut.

Verifikation: Testdatensatz über alle sechs Tabellen angelegt (Quelle → Forschungsfrage → Thema → Passage → AI-Log), Join über `sources`/`research_questions` aus `passages` funktioniert, anschließend wieder gelöscht. RLS geprüft, indem derselbe Zugriff mit dem `anon`-Key (kein eingeloggter Nutzer) probiert wurde - alle sechs Tabellen liefern `permission denied for table ...`, wie erwartet.

## Paket 2 – Einstellungen: Thema, FFs, Themenfelder ☑

- Einstellungs-Ansicht: Dissertationsthema (Freitext), Forschungsfragen (FF1…FFn, sortierbar), Themenfelder (Name + Kurzbeschreibung) anlegen/bearbeiten.
- Die echten Forschungsfragen und Themenfelder der Arbeit eintragen (Autor liefert sie in der Sitzung).
- **Fertig, wenn:** Reale FFs und Themenfelder sind im Tool und werden von der Pipeline gelesen.

**Notizen:**

Migration `0015_app_settings.sql`: Singleton-Tabelle `app_settings` für das Dissertationsthema (Muster `id boolean primary key default true check (id)` - Primary Key erzwingt maximal eine Zeile). `research_questions`/`topics` bestanden schon aus Paket 1.

Neue Ansicht `frontend/src/views/Einstellungen.tsx` (+ `lib/settings.ts`): drei Karten (Thema-Freitext, Forschungsfragen mit Kürzel/Frage/Auf-Ab-Sortierung, Themenfelder mit Name/Kurzbeschreibung), jeweils inline editierbar. Kein Wireframe für diese Ansicht vorhanden (Konzept nennt sie nur als Datenmodell, keine explizite Skizze) - deshalb schlank an den bestehenden Formular-Mustern aus `QuellenDetail.tsx` orientiert statt neu erfunden. Kein eigener Haupt-Nav-Eintrag (die sechs festen Ansichten aus dem Wireframe bleiben unverändert), stattdessen ein ⚙️-Icon im Header neben „Abmelden".

Echte Daten eingetragen (Autor lieferte Forschungsfragen-Screenshot der Stringenzmatrix + Venn-Diagramm der Themenfelder): Dissertationsthema, 7 Forschungsfragen (HFF, TSFF1a, TSFF1b, TSFF2, ESFF1, ESFF2, GSFF) und 3 Themenfelder (Business-IT Alignment (BITA), Digitale Transformation, Deutsche Sachversicherung) direkt per Service-Role-Skript gesetzt (keine Testdaten, echter Bestand).

Zusätzlich besprochen: Autor möchte Themenfelder-Überschneidungen mit Quellenzahl visualisieren (klickbar → Liste der Quellen). Dafür brachte der Autor aktualisierte Dokumente mit (`konzept-literatur-tool.md` v0.5, `wireframes-littool.md`, Referenz `Evaluationsmatrix_Interaktiv.html`) - als **Paket 11/12 (Evaluationsmatrix)** in diesen Arbeitsplan aufgenommen, `arbeitsplan-phase-3_1.md` (Duplikat) wieder gelöscht.

Browser-Check: TypeScript-Build (`tsc -b`) und `vite build` laufen fehlerfrei, Dev-Server liefert `/einstellungen` mit HTTP 200. Der eingeloggte Klick-Durchlauf selbst wurde nicht automatisiert geprüft, weil das App-Login echte Zugangsdaten braucht, die ich nicht eingebe - bitte einmal kurz selbst gegenprüfen.

## Paket 3 – Analyse-Pipeline: Themen & Relevanz ☑

- Worker-Job je Quelle: Claude erhält Metadaten + Abstract + repräsentative Chunks und liefert strukturiert (JSON): zugeordnete Themenfelder (mehrere erlaubt), Relevanz 0–3 je Forschungsfrage mit Ein-Satz-Begründung.
- Ergebnisse als `unbestätigt` speichern; jeder Lauf erzeugt AiLog-Einträge.
- Batch-fähig mit Wiederaufnahme; Kosten je Quelle loggen.
- **Kalibrierung zuerst:** Pipeline an 5 gut bekannten Quellen laufen lassen, Ergebnis manuell mit eigener Einschätzung vergleichen, Prompt nachschärfen – erst dann weiter.
- **Fertig, wenn:** Die 5 Kalibrier-Quellen plausibel zugeordnet sind und der Autor die Zuordnungen überwiegend teilt.

**Notizen:**

`worker/littool_worker/analysis.py` + CLI-Befehl `analyze-topics` (`--limit`, `--source-id` wiederholbar für gezielte/Kalibrier-Läufe). Repräsentative Chunks: bis zu 8 über den Chunk-Index gleichmäßig verteilte Auszüge statt Volltext (Kostengründe, Dokumente teils >100 Seiten). Claude antwortet als JSON (kein `output_config.format`, da `claude-sonnet-4-6` strukturierte Outputs laut Anthropic-Doku nicht unterstützt) - Parsing bewusst streng: unbekannte Themenfeld-Namen/FF-Kürzel oder fehlende FF-Einträge lösen einen sichtbaren Fehler aus (`sources.analysis_status='failed'` + Hint) statt still zu raten. Ergebnisse ersetzen bei jedem Lauf nur `confirmed=false`-Zuordnungen - bereits im QS-Workflow bestätigte Einträge bleiben bei einer erneuten Analyse unangetastet. Migration `0016_sources_analysis_status.sql` (Status-Spalten an `sources`, gleiches Muster wie `extraction_status`).

Kalibrierung (5 Quellen über alle drei Themenfelder: Teece 2007, "Aligning with new digital strategy" 2018, "Understanding digital transformation" 2019, Gutierrez-Lycett 2011, VAIT-Rundschreiben 2022): Dabei einen Prompt-Bug gefunden und behoben (Claude gab teils "Name: Beschreibung" statt nur den Namen zurück - jetzt Namen im Prompt in Anführungszeichen abgesetzt). Nach dem Fix vom Autor als plausibel bestätigt (differenzierte Relevanz, nicht pauschal hoch - z. B. VAIT-Rundschreiben bekommt ESFF2=0 mit nachvollziehbarer Begründung).

Nebenbefund: 3 verwaiste Testdatensätze aus `0004_sources_seed.sql` (Phase 1) ohne echtes PDF/Chunks im Bestand entdeckt (1 Dublette von Teece 2007, 2 nie durch echten Upload ersetzt) - nach Rücksprache mit Migration `0017_remove_seed_fixture_duplicates.sql` entfernt (Bestand danach 152 statt 155 Quellen).

Batch-Lauf über den gesamten Bestand: 150 von 152 Quellen analysiert, 2 Fehler (die zwei bekannten, unreparierbaren Springer-Duplikate ohne Chunks - erwartet, kein neuer Fund). 230 Themenfeld-Zuordnungen, 1050 Relevanz-Bewertungen (150 × 7 FF), Gesamtkosten ca. $2,43. Bei der Nachkontrolle selbst einen Fehler verursacht (Bulk-`.select()` ohne Limit bei einer Diagnose las nur die PostgREST-Standard-Zeilenzahl zurück, siehe bekanntes Muster in `notizen-phase-1-2.md` - fälschlich als Datenlücke gedeutet und beim Nachstellen der Hypothese versehentlich echte `confirmed=false`-Zeilen zweier Quellen überschrieben); mit `--source-id` gezielt neu analysiert, per `count='exact')`-Abfrage pro Quelle (nicht bulk) verifiziert: alle 150 Quellen exakt 7 Relevanz-Zeilen, keine Anomalien mehr.

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

## Paket 11 – Evaluationsmatrix: Kriterien & KI-Vorbewertung ☐

- Migration: `criterion_sets`, `criteria`, `source_criteria` (wert 0/1/2, begründung, confirmed) gemäß Konzept.
- Einstellungs-Bereich: Kriterien-Set anlegen (Name + Kriterien mit Kurznamen, sortierbar); das reale Set der Forschungslücken-Matrix (8 Kriterien) eintragen.
- Worker-Job: KI-Vorbewertung je Quelle × Kriterium (voll/teilweise/nicht, mit Ein-Satz-Begründung), als `unbestätigt`; läuft über die Analyse-Hilfsschicht, AiLog inklusive.
- Bestehende Bewertungen aus der vorhandenen `Evaluationsmatrix_Interaktiv.html` (liegt als Referenz in `docs/`) als Startdaten importieren – die dort per Hand bewerteten Quellen gelten als `bestätigt`.
- **Fertig, wenn:** Das 8-Kriterien-Set steht, importierte Bewertungen stimmen mit der HTML-Vorlage überein, neue Quellen werden vorbewertet.

## Paket 12 – Evaluationsmatrix: Ansicht & Export ☐

- Matrix-Modus in der FF-Ansicht: Zeilen nach Schnittmengen gruppiert, Zellen ●/◐/○, Spalten VHB + Score, eigene Arbeit als hervorgehobene Referenzzeile; Filter (Schnittmenge, VHB, Neu), Suche; Zelle anklicken → Wert ändern, Begründung sehen (zählt als Bestätigung).
- **Export HTML:** eigenständige interaktive Datei im Stil der Design-Referenz (Filter, Suche, Legende, Kernaussage-Callout, Score-Statistik) – ohne Abhängigkeit zum Tool weitergebbar.
- Export CSV.
- **Fertig, wenn:** Die aus dem Tool exportierte HTML-Matrix der handgebauten Vorlage ebenbürtig ist und sich mit einem Klick aktualisiert erzeugen lässt.

---

## Danach

Arbeitsplan Phase 4 (Zitat-Häkchen, Verwendet-Ansicht, Literaturverzeichnis-Generator, KI-Verzeichnis-Export, Aktivitätslog) im Chat erstellen – der kleinste Plan, danach kommt die Schreibwerkstatt.
