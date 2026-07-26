# Arbeitsplan Phase 3 – Forschungsfragen, Analyse & Passagen

Ziel der Phase: Thema, Forschungsfragen und Themenfelder sind im Tool hinterlegt. Jede Quelle ist thematisch eingeordnet, hat ein Methodenprofil und extrahierte Passagen (Original + Übersetzung + Zitation) je Forschungsfrage. Forschungsfragen-Ansicht, Matrix, QS-Workflow und Paraphrase-Funktion stehen.

Voraussetzung: Phase 2 abgeschlossen (Bestand gechunkt, eingebettet, durchsuchbar).

**Entscheidung Übersetzung (Vorschlag, im Paket 4 umgesetzt):** Passagen werden bei der Extraktion sofort mitübersetzt (kurz, Kosten minimal, beste UX). Volltexte nur on demand. Kein Vorab-Übersetzen ganzer Dokumente.

---

## ⚠️ Eingeschobenes Paket K – Seiten-Offset & Backup (SOFORT, vor allem Weiteren) ☑

Hintergrund: Journal-Artikel beginnen im PDF bei Seite 1, im Journal aber z. B. bei Seite 1319. Bisher wird die PDF-Seite auch für Zitationen verwendet – das wäre falsch. Außerdem fehlt eine Datensicherung.

- Migration: `page_offset` (integer, default 0) an `sources`.
- Offset-Ableitung: aus Crossref-Feld „erste Seite" minus 1; Backfill für alle vorhandenen Quellen; nicht ableitbare Fälle (Bücher, graue Literatur, fehlende Metadaten) → Offset 0 + Markierung `needs_review`.
- Zitationslogik umstellen: Zitationsseite = PDF-Seite + page_offset, überall generiert statt gespeichert (Passagen, Kopier-Buttons, künftige Exporte). Bereits erzeugte, fest gespeicherte Zitations-Strings der Passagen neu generieren.
- Quellen-Detailseite: Offset-Feld editierbar mit Plausibilitäts-Anzeige („PDF-Seite 1 = zitiert als S. …").
- `scripts/backup.sh` anlegen (DB-Dump + PDF-Bucket-Sync) und einmal ausführen; Restore-Test dokumentieren.
- Stichprobe: 5 Passagen – Zitationsseite mit der sichtbaren Seitenzahl im PDF abgleichen.
- **Fertig, wenn:** Zitationen tragen Journal-Seiten, ein erstes Backup existiert, Restore wurde getestet.

**Notizen (Zitationslogik, Migrationen 0019-0022):**

`format_citation(authors, year, page)` liegt als einzige Quelle der Wahrheit in der DB (nicht in Python dupliziert) - ein Trigger auf `sources` (feuert bei Änderung von `authors`/`year`/`page_offset`) hält `passages.citation` automatisch synchron, wenn eine Quelle später in der Bibliothek vervollständigt wird. `passages.page` bleibt strikt die PDF-Seite (Viewer-Sprung), die Zitationsseite wird erst beim Anzeigen/Speichern aus PDF-Seite + `page_offset` gebildet.

Backfill zunächst nur anhand des `pages`-Bereichs aus Crossref (0020) - Stichprobe deckte auf, dass das nicht reicht: **9 von 44 automatisch abgeleiteten Offsets waren falsch**, weil das hinterlegte PDF ein Preprint/Repository-Exemplar (ResearchGate o. Ä.) mit eigener, vom Verlags-PDF abweichender Paginierung ist - teils mit zufällig gleicher Gesamtseitenzahl wie die echte Verlagsversion, was einen reinen Seitenzahl-Abgleich täuscht. Deshalb zweistufige Validierung (`fulltext.py:_compute_page_offset`): (1) PDF-Seitenzahl muss zum erwarteten Bereich passen, (2) eine Stichproben-Seite muss die erwartete Zitationsseite tatsächlich als aufgedruckte Zahl enthalten. Nicht bestehende Fälle → Offset 0 + `needs_review` statt einer unzuverlässigen Zahl (Migrationen 0021/0022, 9 Quellen betroffen). Gleiche Validierung ist jetzt auch fest in `run_fulltext_extraction` verdrahtet, damit künftige Uploads automatisch den korrekten Offset bekommen (oder sichtbar als unsicher markiert werden) - kein manueller Nachtrag mehr nötig.

Stichprobe (Paket-Kriterium): mehrere Passagen gegen den tatsächlichen PDF-Text geprüft (`fitz`, Klartext-Auszug der jeweiligen Seite) - berechnete Zitationsseite stimmt exakt mit der im PDF aufgedruckten Seitenzahl überein (z. B. Vial 2019: PDF-Seite 20 zeigt gedruckt "1178", berechnete Zitationsseite 1178).

Quellen-Detailseite: neues Feld „Seiten-Offset (PDF-Seite → Zitationsseite)" mit Plausibilitätstext („PDF-Seite 1 = zitiert als S. …").

`scripts/backup.sh` fertig getestet, nachdem Docker Desktop installiert war: `supabase db dump --linked` ohne Zusatzflag ist per Default **immer `--schema-only`** (Zeilendaten fehlen) - Skript macht deshalb zwei Dumps, `schema.sql` (Referenzstand, Schema liegt ohnehin schon in `supabase/migrations/`) und `data.sql` (`--data-only --use-copy`, die eigentlich schützenswerten Zeilendaten). Plus PDF-Bucket-Sync (`supabase storage cp -r --linked --experimental`).

Restore-Test: `schema.sql` + `data.sql` in einen frischen, isolierten `supabase/postgres`-Docker-Container geladen (nicht gegen die echte DB) - alle 9 eigenen Tabellen exakt mit den erwarteten Zeilenzahlen wiederhergestellt (152 sources, 18910 chunks, 282 passages, 1050 source_rq_relevance, 230 source_topics, 7 research_questions, 3 topics, 365 ai_log_entries). Vereinzelte Fehler beim Laden betrafen ausschließlich Supabase-interne System-Tabellen (`auth.*`, `storage.*`) - irrelevant für unsere Daten. Container danach entfernt.

---

## ⚠️ Eingeschobenes Paket B – BibTeX-Import aus Citavi (Datenbestand-Reparatur) ☐

Hintergrund: Von ~150 PDFs im Bestand konnten 88 nicht automatisch mit Metadaten angereichert werden (v. a. graue Literatur ohne DOI). Ein BibTeX-Export aus Citavi enthält die Metadaten aus der bisherigen Vorarbeit.

- Upload-Funktion für eine .bib-Datei; Parser für die gängigen Entry-Typen (article, book, incollection, techreport, misc …).
- **Matching gegen bestehende Quellen, dreistufig:** 1) DOI (exakt), 2) Titel-Ähnlichkeit (Fuzzy, Schwellwert, Jahr als Plausibilitätscheck), 3) Rest → manueller Zuordnungs-Dialog (BibTeX-Eintrag ↔ Quelle nebeneinander, per Klick verheiraten).
- Übernahme-Regel: BibTeX füllt nur **leere** Felder automatisch; Konflikte mit vorhandenen (Crossref-)Werten werden angezeigt statt überschrieben. Erfolgreich angereicherte Quellen → Status `complete`.
- BibTeX-Einträge ohne passendes PDF: Liste anzeigen, optional als Quellen ohne Datei anlegen (zitierbar, `kein PDF`-Kennzeichen).
- Bericht am Ende: n per DOI, n per Titel, n manuell, n offen, n neu angelegt.
- **Fertig, wenn:** Die Zahl der `needs_review`-Quellen deutlich gesunken ist und die graue Literatur vollständige Metadaten trägt.

**Notizen:**

`worker/littool_worker/bibtex_import.py` + CLI `import-bibtex <pfad> [--apply] [--verbose]` (Dry-Run per Default). Parser: `bibtexparser` (neue Abhängigkeit, v1.x - v2 hat eine noch instabile API), LaTeX-Escaping (Umlaute, `{\ss}`, deutsche Anführungszeichen) wird über `convert_to_unicode` aufgelöst. Autoren-Split behandelt sowohl "Family, Given"- als auch klammerte "Given Family"-Form (Citavi-Artefakt bei nicht eindeutig trennbaren Namen).

Matching wie geplant dreistufig: 1) DOI exakt, 2) Titel-Ähnlichkeit (`SequenceMatcher`, gleiche Schwelle 0.85 wie `duplicates.py`) + Jahr-Plausibilität (±1), 3) Rest unmatched. Titel-Normalisierung behandelt Bindestriche/Unterstriche als Leerzeichen (viele Bestandstitel sind aus dem PDF-Dateinamen abgeleitet, nicht kuratiert) - ohne das wären etliche offensichtliche Treffer durchgefallen. Übernahme-Regel exakt wie im Plan: nur leere Felder werden gefüllt, Konflikte (beide Seiten haben einen abweichenden Wert) werden nur gemeldet, nie überschrieben - Stichprobe der Konflikte zeigte ausschließlich harmlose Formatierungsunterschiede (ISSN mit/ohne Bindestrich, DOI-Großschreibung) plus zwei echte Jahres-Abweichungen (2026↔2025, 2023↔2022), korrekt unangetastet gelassen.

Lauf gegen `ISP_Daten_neu.bib` (91 Einträge): 38 per DOI, 17 per Titel automatisch zugeordnet; von den verbleibenden 36 wurden 9 nach kurzer Rücksprache im Chat (eindeutig trotz niedrigerem Score, z. B. Tippfehler im Bestandstitel) ergänzt. `needs_review` 104 → 89, `complete` 48 → 63.

Kein dediziertes Zuordnungs-UI gebaut (Autor-Entscheidung: einmalige Aufräumaktion, schneller im Chat klären als eine wiederverwendbare Oberfläche für einen Vorgang, der nicht regelmäßig anfällt) - stattdessen Liste der 28 verbleibenden unmatched Einträge (inkl. jeweils ähnlichstem Kandidaten im Bestand als Anhaltspunkt) als Datei an den Autor übergeben, für spätere manuelle Prüfung/Übertragung. Neuanlage von Quellen ohne PDF für Einträge ohne Bestandstreffer bewusst nicht automatisch gemacht (nur "optional" laut Plan).

---

## ⚠️ Eingeschobenes Paket F – Funktion-Dimension ☑

Hintergrund: Nicht jede Quelle zahlt auf ein Themenfeld ein (z. B. reine Methodik-Literatur) - trotzdem soll sie nicht als "nicht eingeordnet" auffallen und keine Schnittmengen/Evaluationsmatrix verschmutzen. Zusätzliche, unabhängige Dimension: die Funktion der Quelle in der Arbeit.

- Migration: `work_functions` (id, name), `source_functions` (source_id, function_id n:m, confirmed). Startwerte: „Themenfeld-Literatur" (Standard), „Einleitung/Problemstellung", „Methodik" - Liste später erweiterbar.
- Analyse-Pipeline (Paket 3) ergänzen: Claude schlägt zusätzlich eine Funktion vor (unbestätigt).
- Bibliothek/Quellen-Detail: Funktion als Chips, händisch setzbar, Filter in der Bibliothek ergänzen.
- Quellen mit reiner Funktions-Zuordnung ohne Themenfeld gelten als vollständig eingeordnet.
- **Fertig, wenn:** Die drei Startfunktionen stehen, sind in Bibliothek/Detail sichtbar und filterbar, die Analyse-Pipeline schlägt sie vor.

**Notizen:**

Migration `0023_work_functions.sql`: `work_functions` (id, name unique) + `source_functions` (source_id, function_id, confirmed, PK auf beiden IDs) mit RLS/Policy/Grant, Seed der drei Startfunktionen. Bewusst als eigene, von `run_topic_relevance_analysis` getrennte Pipeline gebaut (`run_function_suggestion` in `analysis.py`, CLI-Befehl `suggest-functions`) - verhindert, dass das Nachtragen der Funktion die bereits bezahlte Themen-/Relevanz-Analyse für alle ~150 Quellen erneut anstößt. Frontend: Funktion-Chips in `QuellenDetail.tsx` (händisch togglebar, `confirmed=true`), Filter-Dropdown in `Bibliothek.tsx` (`lib/functions.ts` kapselt die Supabase-Zugriffe).

Kalibrierung an 6 bekannten Quellen (Theorie-Paper, SLR, Marktbericht, Verordnung) ergab zunächst durchgehend „Themenfeld-Literatur" - auffällig beim McKinsey-Marktbericht und dem BaFin-Rundschreiben, die dem Prompt-eigenen Beispiel für „Einleitung/Problemstellung" entsprechen. Mit dem Nutzer abgestimmt: Grenze ist inhaltlich fließend (diese Berichte liefern selbst Themenfeld-Inhalt zur Sachversicherung), keine Prompt-Anpassung nötig. Voller Lauf über die restlichen 146 unmarkierten Quellen bestätigte das - der Prompt unterscheidet durchaus (u. a. mehrere Deloitte-/Marktberichte wurden korrekt als „Einleitung/Problemstellung" erkannt), es war kein systematischer Bias. Ergebnis: 144 zugeordnet, 2 Fehler (vorbestehend `analysis_status=failed`, keine Chunks wegen Font-Encoding-Defekt bzw. fehlgeschlagener Fulltext-Extraktion, s. Paket 0). Gesamtkosten ca. $1.17 (Kalibrierung + Volllauf).

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

## Paket 4 – Zitate auf Abruf + Übersetzung ☑

- **Kein Batch über den Bestand.** Button „Zitate erzeugen" an Quelle (Bibliothek-Zeile und Detailseite; berücksichtigt aktiven Themengebiets-/FF-Filter als Kontext): Claude erhält die passenden Chunks (semantische Vorauswahl aus Phase 2) und liefert wörtliche Zitat-Kandidaten: Originaltext exakt, Seite, FF-/Themen-Bezug, deutsche Übersetzung, Zitation (aus Seite + Offset generiert).
- Kontrolle: Kandidat muss im Chunk-Text nachweisbar sein (String-Abgleich mit Toleranz) – nicht Verifizierbares wird verworfen und geloggt.
- Prüf-Dialog direkt nach Erzeugung: Kandidaten-Karten mit Deep-Link ins PDF; je Karte bestätigen (→ Zitat-Pool) oder verwerfen. Unbestätigte Kandidaten verfallen.
- Manueller Weg (aus Paket 7 vorgezogen, gehört logisch hierher): Text im Viewer markieren/einfügen + Seite → Zitat im Pool, gilt als bestätigt.
- AiLog je Erzeugungslauf.
- **Fertig, wenn:** Für 2 Kalibrier-Quellen: erzeugen → im PDF prüfen → bestätigen funktioniert flüssig, Seiten und Zitationen stimmen, Verworfenes verschwindet.

**Notizen:**

Umgeplant (Autor brachte Konzept v0.6 mit): ursprünglich als Batch über den ganzen Bestand gebaut (`analyze-topics`-artiger Job je Quelle × relevanter FF), jetzt auf Pull-Modell umgestellt - kein automatischer Massenlauf mehr, Zitate entstehen nur noch auf Abruf beim Arbeiten. Der Batch-Job für die restlichen 660 offenen Quelle-FF-Paare wurde gestoppt (0 Fehler, keine angebrochenen Schreibvorgänge). Die schon erzeugten 140+ Passagen (Kalibrierung + Batch-Anfang, echte Kosten ca. $3,50) bleiben als unbestätigte Kandidaten in der DB - sie werden beim ersten Durcharbeiten über die neue Prüf-UI bestätigt/verworfen, kein erneuter Claude-Aufruf nötig dafür.

**Architektur-Entscheidung (mit Nutzer abgestimmt):** Ein Button, der jederzeit (auch vom Handy) funktionieren soll, passt nicht zum lokalen Python-Worker (CLI, nur manuell gestartet) - der müsste dafür als Dauer-Dienst laufen. Stattdessen neue Supabase Edge Function `generate-citations` (`supabase/functions/generate-citations/index.ts`), analog zur bestehenden `search`-Function (Phase 2, Paket 8): Claude- und Voyage-Aufruf laufen serverseitig innerhalb des Button-Klicks, kein Dauer-Dienst nötig. Prompt-/Verifikations-/Zitations-Logik aus `worker/littool_worker/passages.py` nach TypeScript portiert (beide Varianten bewusst synchron gehalten, falls der Python-Pfad später doch wieder gebraucht wird). `ANTHROPIC_API_KEY` zusätzlich als Edge-Function-Secret hinterlegt (`npx supabase secrets set`) - getrennt vom Worker-`.env`, weil die Function serverseitig bei Supabase läuft, nicht im Worker-Kontext.

**Scope-Vereinfachung (mit Nutzer abgestimmt):** Die Bibliothek hat noch keinen Themenfeld-/Forschungsfrage-Filter (kommt erst mit der FF-Ansicht, Paket 7) - der Button berücksichtigt deshalb vorerst keinen aktiven Filter, sondern erzeugt Kandidaten für alle Forschungsfragen mit Relevanz ≥ 1 zur Quelle (wie im ursprünglichen Batch-Job). Einschränkung auf eine einzelne aktive FF kann nachgezogen werden, sobald Paket 7 existiert.

Echter Bug beim ersten Kalibrier-Test gefunden: zwei "Zitate" waren tatsächlich Literaturverzeichnis-Einträge (Referenzen auf andere Werke) - sie stehen wörtlich im PDF-Text (im Quellenverzeichnis der Quelle selbst) und bestehen deshalb die reine Substring-Verifikation, sind aber keine inhaltliche Aussage der Quelle. Behoben durch eine explizite Anti-Regel im System-Prompt (erkennbar am typischen Referenz-Format); nach dem Fix keine Literaturverzeichnis-Treffer mehr in der Stichprobe.

Kalibrierung an Charoensuk et al. (2014): 2 Läufe direkt gegen die Edge Function (vor/nach dem Prompt-Fix). Nach dem Fix: 10 verifizierte Kandidaten über 5 Forschungsfragen, 7 automatisch verworfen (nicht im Text nachweisbar), Zitationen korrekt (Seite + Offset).

Zweite Kalibrier-Quelle live in der Produktions-App getestet (Weber, 2019, "Digitale Transformation bei Versicherungsunternehmen"): Button erzeugt Kandidaten über alle relevanten FFs (TSFF1a, HFF, …), Prüf-Dialog zeigt Original + Übersetzung + korrekte Zitation je Karte, „Übernehmen"/„Verwerfen" funktionierte flüssig. Dabei mit dem Nutzer geklärt: die Funktion-Chips (Paket F) und die Zitat-Erzeugung sind bewusst unabhängige Dimensionen - die Chip-Auswahl (z. B. „Einleitung/Problemstellung") schränkt die erzeugten FFs nicht ein, das ist kein Fehler. Beide Kalibrier-Kriterien damit erfüllt - Frontend zusätzlich mit `tsc`/Lint sauber.

## Paket 5 – Methodenprofil-Extraktion ☑

- Worker-Job je Quelle: Studientyp (qualitativ/quantitativ/mixed/konzeptionell/Review), Methode, Datengrundlage/Sample, Auswertungsverfahren – strukturiert, mit Fundstellen-Hinweis (Seite des Methodenteils), als `unbestätigt`.
- Graue Literatur: Studientyp „nicht anwendbar" zulässig.
- **Fertig, wenn:** 5 Kalibrier-Quellen korrekt profiliert; Anzeige auf der Quellen-Detailseite inkl. Bestätigen-Button.

**Notizen:**

Migration `0024_method_profiles.sql`: `method_profiles` 1:1 zur Quelle (`source_id` direkt als Primary Key, anders als die n:m-Tabellen `source_topics`/`source_functions`). Eigener Worker-Job `run_method_profile_extraction` (`analysis.py`, CLI `profile-methods`) - wie Paket F bewusst getrennt von der Themen-/Relevanz-Analyse, damit Nachtragen nicht die bereits bezahlte Analyse erneut anstößt. `page_hint` wird gegen die tatsächlich mitgeschickten Chunk-Seiten validiert (nicht nachweisbare Seite → `null`), analog zum Verifikationsprinzip aus Paket 4 - verhindert erfundene Seitenangaben.

Kalibrierung an 5 bewusst unterschiedlichen Quellentypen: Teece et al. (Dynamic Capabilities, Theoriepaper) → `konzeptionell`; Rundschreiben 3/2009 VA (Verordnung) → `nicht_anwendbar`; McKinsey-Marktbericht → `nicht_anwendbar`; systematisches Literatur-Review → `review` mit korrekt erkannter Datengrundlage (112 Paper aus IEEE/ACM/ICEIS); Charoensuk et al. (Survey-Studie) → `quantitativ` mit SEM als Auswertungsverfahren. Alle five korrekt, keine Nacharbeit am Prompt nötig. Anzeige + Bestätigen-Button auf der Quellen-Detailseite (`lib/methodProfiles.ts`), inkl. Sprung zur Methodenteil-Seite im PDF-Viewer. Frontend kompiliert/lintet sauber.

## Paket 6 – QS-Workflow ☑

- Prüf-Ansicht (in Bibliothek und FF-Ansicht erreichbar): alle unbestätigten Zuordnungen, Relevanzen, Passagen, Methodenprofile als Karten – bestätigen, korrigieren (Relevanz ändern, Thema entfernen/ergänzen, Passage bearbeiten/löschen).
- Zähler „n unbestätigt" als Badge; Korrekturen setzen `confirmed`.
- **Fertig, wenn:** Ein kompletter Quellen-Durchlauf lässt sich in wenigen Minuten prüfen; mobil bedienbar.

**Notizen:**

Scope-Vereinfachung (gleiches Prinzip wie bei Paket 4): Die FF-Ansicht existiert noch nicht (Paket 7, aktuell Platzhalter) - die Prüf-Ansicht ist deshalb vorerst nur aus der Bibliothek erreichbar (Badge „🔍 n unbestätigte KI-Zuordnungen prüfen" oben, analog zur bestehenden „⚠️ n zu prüfen"-Badge). Ein Link von der FF-Ansicht kann ergänzt werden, sobald Paket 7 existiert.

Zwei neue Routen: `/pruefen` (Liste aller Quellen mit >0 unbestätigten Zeilen, absteigend sortiert, Zaehlung aggregiert clientseitig ueber alle fuenf Dimensionen - `lib/qsReview.ts`) und `/pruefen/:sourceId` (Karten je Dimension: Themenfelder mit Bestätigen/Entfernen + „Thema ergänzen"-Auswahl, Relevanz mit änderbarem Wert, Zitate mit editierbarem Original/Übersetzung, Methodenprofil, Funktion). Jede Aktion schreibt direkt in die jeweilige Tabelle (kein Batch-Speichern) und entfernt die Karte lokal.

Live getestet an einer Quelle mit gemischtem Inhalt (Themenfeld bestätigen/entfernen, Relevanz-Karten, Zitat bestätigen) - alle Aktionen persistieren korrekt in der DB, verifiziert per Direktabfrage. Dabei ein echter Bug gefunden und behoben: nach dem Bestätigen eines Themas erschien es faelschlich wieder im „Thema ergänzen"-Dropdown, weil die Verfügbarkeitsprüfung nur gegen die (jetzt gefilterte) unbestätigte Liste lief statt gegen alle zugewiesenen Themen - behoben über ein separates `assignedTopicIds`-Set, das unabhaengig vom Bestätigt-Status aktuell bleibt. Mobile Ansicht (375px) geprüft: einspaltig, keine Überläufe.

## Paket 7 – Forschungsfragen-Ansicht ☑

- UI gemäß Wireframe: FF-Liste mit Zitate-Zähler links, rechts die **bestätigten Zitate aus dem Pool** als Karten (Sterne, Original einklappbar, Übersetzung, Zitation kopieren, PDF-Sprung, ¶, 💬-Platzhalter für Phase 5). Der Pool wächst durch dein Arbeiten – die Ansicht zeigt nur Geprüftes.
- Sortierung (Relevanz/Quelle/Jahr), Filter (Thema, Ranking, Studientyp, Funktion).
- **Fertig, wenn:** Pro FF entsteht ein brauchbarer Arbeitsüberblick, mobil wie Desktop.

**Notizen:**

Ersetzt den Platzhalter-View. Karte enthält bewusst KEIN ¶ (Paraphrase - kommt erst mit Paket 9) und ein deaktiviertes 💬 (Tooltip "kommt in Phase 5", exakt wie im Plan vorgesehen). Das „☐ verwendet"-Häkchen aus dem Wireframe wurde bewusst weggelassen - gehört laut Konzept zu `UsedCitation`/der „Verwendet"-Ansicht, die explizit erst in Phase 4 geplant ist (siehe Notiz Zeile 241), nicht Phase 3. Der „[Matrix]"-Umschalter im Wireframe führt zu Paket 8 (noch nicht gebaut) und wurde ebenfalls ausgelassen.

Daten: `lib/ffView.ts` holt bestätigte Passagen einer FF in einem einzigen verschachtelten Postgrest-Select (`passages → sources → source_topics/method_profiles/source_functions`), Filter (Thema/Ranking/Studientyp/Funktion) laufen clientseitig auf dem bereits geladenen, kleinen Ergebnis. Zähler je FF (`●n`) zählt bestätigte Passagen unabhängig vom aktuellen Filter.

Live getestet: FF-Liste mit korrekten Zählern, Kartenanzeige (Sterne, Original auf-/zuklappbar, Übersetzung, Zitation, PDF-Deep-Link mit Seiten-Sprung), Themenfilter reduziert sichtbare Karten korrekt auf 0 bei Nichttreffer. "Zitation kopieren" scheiterte in der automatisierten Testumgebung an einer Clipboard-Berechtigung des Browser-Tools selbst (`Write permission denied`, per direktem JS-Test bestätigt, kein Code-Fehler) - trotzdem eine sichtbare Fehlerrückmeldung ergänzt (`✗ fehlgeschlagen`) statt stillschweigend nichts zu tun. Mobile Ansicht (375px): Master-Detail-Umschaltung (FF-Liste ↔ Karten mit „← Zur FF-Liste") funktioniert wie in der Bibliothek/Quellen-Detail-Ansicht etabliert.

## Paket 8 – Matrix-Ansicht ☑

- Matrix Quellen × Forschungsfragen, Zellen = Relevanz (leer/•/••/•••), Zeilen sortier-/filterbar (Ranking, Studientyp), Klick auf Zelle öffnet die Passagen.
- Export als CSV/kopierbare Tabelle (Vorstufe zur Deskriptionsmatrix, inkl. Spalten Methodenprofil + Ranking).
- **Fertig, wenn:** Die Matrix des echten Bestands lesbar ist und der Export in Word/Excel einfügbar aussieht.

**Notizen:**

Erreichbar über den „📊 Matrix"-Umschalter in der Forschungsfragen-Ansicht (löst den in Paket 7 bewusst ausgelassenen Platzhalter ein), `components/RelevanceMatrix.tsx` + `lib/matrix.ts`. Bewusst anders als die FF-Ansicht: die Matrix zeigt die Relevanz aus `source_rq_relevance` unabhängig vom Bestätigt-Status (nicht nur den bestätigten Pool) - sonst wäre sie angesichts des noch großen QS-Rückstands (Paket 6) fast leer und nicht "lesbar" im Sinne des Fertig-Kriteriums. Zellklick öffnet ein Modal mit der KI-Begründung (`source_rq_relevance.reasoning`) plus eventuell schon bestätigten Zitaten dieser Quelle-FF-Kombination - nützlicher Kontext auch bevor Zitate extrahiert wurden.

Live getestet gegen den echten Bestand: Matrix mit ~90 Zeilen (nur Quellen mit mindestens einer Relevanzbewertung) rendert lesbar, Zellklick öffnet das Begründungs-Modal korrekt, CSV-Export liefert per Blob-Interception verifiziert korrektes, kommagetrenntes Format mit Header-Zeile (Autor/Jahr, Titel, Ranking, Studientyp, je eine Spalte pro FF-Kürzel) und den gleichen Punkt-Symbolen wie in der UI - passend zum Einfügen in Word/Excel.

## Paket 9 – Paraphrase-Funktion ☑

- ¶-Button an Passagen-Karten (und Textauswahl auf der Quellen-Detailseite): Claude paraphrasiert, Ergebnis erscheint als Vorschlag unter dem Original mit Zitation (Autor, Jahr, S. x).
- Übernahme per Klick speichert die Paraphrase an der Passage; verwerfen möglich; jede Paraphrase → AiLog.
- **Fertig, wenn:** Markieren → Paraphrase → prüfen → übernehmen funktioniert flüssig, auch mobil.

**Notizen:**

Gleiches Architekturprinzip wie Paket 4/generate-citations: neue Edge Function `paraphrase-passage` (Claude-Aufruf serverseitig, kein Dauer-Dienst). Die Paraphrase wird bewusst NICHT direkt gespeichert - die Function liefert nur den Vorschlagstext zurück, `lib/paraphrase.ts` haelt ihn im Frontend-State bis „Übernehmen" (schreibt `passages.paraphrase`) oder „Verwerfen" (verwirft lokal, nichts in der DB). AiLog-Eintrag (`action_type='paraphrase'`, bereits in Migration 0014 vorgesehen) entsteht trotzdem sofort bei der Erzeugung, unabhängig von Übernehmen/Verwerfen - die KI-Aktion selbst ist protokollierungspflichtig (CLAUDE.md), nicht erst die Übernahme.

Zwei Einstiegspunkte wie im Plan: (1) ¶-Button an bestätigten Passagen-Karten in der Forschungsfragen-Ansicht, (2) im manuellen Zitat-Formular auf der Quellen-Detailseite ein „¶ erzeugen"-Button neben dem Paraphrase-Feld, der aus dem gerade eingetippten/eingefügten Originaltext eine Paraphrase vorschlägt, bevor das Zitat gespeichert wird.

Live getestet (beide Pfade): Karten-¶-Button erzeugt Vorschlag, „Übernehmen" schreibt korrekt in `passages.paraphrase` (per Direktabfrage verifiziert); manuelles Formular erzeugt Paraphrase aus dem Originaltext-Feld und speichert sie beim Absenden mit demselben Zitat. Mobile Ansicht (375px) geprüft: Karte inkl. Paraphrase-Anzeige und „¶ neu erzeugen"-Button bleibt lesbar, kein Überlauf.

## Paket 10 – Backfill & Kalibrier-Abschluss ☐ (Analyse fertig, QS-Durchgang beim Nutzer)

- Analyse (Pakete 3 und 5: Themen, Relevanz, Funktion, Methodenprofile) über den gesamten Bestand laufen lassen; Kosten notieren. **Zitate ausdrücklich nicht im Batch** – sie entstehen auf Abruf beim Arbeiten.
- QS-Durchgang: mindestens die Quellen mit hoher Relevanz vollständig bestätigen.
- Stichproben-Ehrlichkeitstest: 10 bereits bestätigte Zitate im PDF verifizieren (Text, Seite, Zitation).
- **Fertig, wenn:** Der Bestand ist analysiert, die wichtigsten Zuordnungen sind bestätigt → Phase 3 abgeschlossen. 🎉

**Notizen:**

Analyse-Teil abgeschlossen: `profile-methods` einmalig über den gesamten Bestand gelaufen (Themen/Relevanz/Funktion liefen bereits aus Paket 3/F) - 145 Quellen profiliert, 2 Fehler (dieselben zwei vorbestehenden Faelle ohne Chunks, s. Paket 0/F), Kosten ca. $1,34. Damit sind alle vier Analyse-Dimensionen (Themen, Relevanz, Funktion, Methodenprofil) für 150 von 152 Quellen durchgelaufen.

QS-Durchgang und Ehrlichkeitstest bewusst NICHT von mir übernommen: beim Stichprobencheck fiel auf, dass erst 6 Passagen ueberhaupt bestaetigt sind (ausschliesslich eigene Testdaten aus den Live-Verifikationen der Pakete 4/6/7/9) - ein „10-Zitate-Ehrlichkeitstest" waere an diesem Punkt nur ein Test der eigenen Testdaten gewesen. Wichtiger: Relevanz-/Themen-Bestaetigung ist eine fachliche, wissenschaftliche Einschaetzung - genau dafuer wurde die QS-Ansicht (Paket 6) gebaut, das darf nicht die KI fuer den Autor "durchwinken". Mit dem Nutzer abgestimmt: er uebernimmt den QS-Durchgang selbst über `/pruefen` (30 Quellen haben mindestens eine Relevanz-Bewertung „zentral" = 3, davon 40 einzelne unbestätigte Bewertungen als Ausgangspunkt). Der Stichproben-Ehrlichkeitstest folgt, sobald ausreichend echte Bestätigungen vorliegen - Paket 10 bleibt bis dahin offen markiert.

## Paket 11 – Evaluationsmatrix: Kriterien & KI-Vorbewertung ☐

- Migration: `criterion_sets`, `criteria`, `source_criteria` (wert 0/1/2, begründung, confirmed) gemäß Konzept.
- Einstellungs-Bereich: Kriterien-Set anlegen (Name + Kriterien mit Kurznamen, sortierbar); das reale Set der Forschungslücken-Matrix (8 Kriterien) eintragen.
- **Kriterien-Vorschlag:** Button „Kriterien vorschlagen" – Claude leitet aus Thema, FFs, Themenfeldern und dem Quellenbestand ein Kriterien-Set her; jedes Kriterium mit Begründung und Herleitung. Vorschläge einzeln übernehmen/ändern/verwerfen; Herleitung wird am Kriterium gespeichert; AiLog-Eintrag.
- Worker-Job: KI-Vorbewertung je Quelle × Kriterium (voll/teilweise/nicht, mit Ein-Satz-Begründung), als `unbestätigt`; läuft über die Analyse-Hilfsschicht, AiLog inklusive.
- Bestehende Bewertungen aus der vorhandenen `Evaluationsmatrix_Interaktiv.html` (liegt als Referenz in `docs/`) als Startdaten importieren – die dort per Hand bewerteten Quellen gelten als `bestätigt`.
- **Fertig, wenn:** Das 8-Kriterien-Set steht, importierte Bewertungen stimmen mit der HTML-Vorlage überein, neue Quellen werden vorbewertet.

## Paket 12 – Evaluationsmatrix: Ansicht & Export ☐

- Matrix-Modus in der FF-Ansicht: Zeilen nach Schnittmengen gruppiert, Zellen ●/◐/○, Spalten VHB + Score, eigene Arbeit als hervorgehobene Referenzzeile; Filter (Schnittmenge, VHB, Neu), Suche; Zelle anklicken → Wert ändern, Begründung sehen (zählt als Bestätigung).
- **Export HTML:** eigenständige interaktive Datei im Stil der Design-Referenz (Filter, Suche, Legende, Kernaussage-Callout, Score-Statistik) – ohne Abhängigkeit zum Tool weitergebbar.
- Export CSV.
- **Venn-Grafik der Schnittmengen (noch offen, nicht vergessen):** Themenfelder als Venn-Diagramm mit Quellen-Zähler je Schnittmenge, Klick öffnet die Quellen; Export als Bild für die Arbeit. War in einer früheren Notiz fälschlich als "bereits umgesetzt" vermerkt - ist es nicht, steht noch aus.
- **Fertig, wenn:** Die aus dem Tool exportierte HTML-Matrix der handgebauten Vorlage ebenbürtig ist und sich mit einem Klick aktualisiert erzeugen lässt; die Venn-Grafik zeigt die drei Themenfelder mit korrekten Schnittmengen-Zählern.

---

## ⚠️ Zwischen-Review: Nutzer-Feedback zu Bibliothek & Quellen-Detail

Nach Abschluss der Analyse-Batches (Paket 10/11) hat der Autor die App Schritt für Schritt durchgesehen und direktes Feedback gegeben, bevor es mit Paket 11 weiterging. Umgesetzt:

- **Bestandsbereinigung:** 55 Quellen aus `_Ergaenzend`/`neu`-Unterordnern des lokalen Testordners entfernt (nicht Teil der 4 Hauptordner Einleitung/BITA-DT/DT-Sachversicherung/Sachversicherung-BITA) - Verifikation per Dateiname vor dem Löschen, Backup vorher. Bestand jetzt 97 Quellen. Dabei einen strukturellen Bug in `ai_log_entries` gefunden und behoben (`on delete set null` kollidierte mit dem Check-Constraint, wenn nur `source_id` gesetzt war) - Migration 0026.
- **Löschen:** Endgültiger Löschen-Button in Bibliothek (Zeile) und Quellen-Detail, mit Bestätigungsdialog (`components/ConfirmDialog.tsx`). Entfernt PDF aus dem Storage + Quelle inkl. aller abhängigen Zeilen (Cascade).
- **Bibliothek-Sortierung:** Tabellenköpfe klickbar (Autor/Jahr, Titel, Venue, Ranking, Status), echte `<button>`-Elemente für Tastatur-/Screenreader-Zugänglichkeit statt reiner `onClick`-Handler auf `<th>`.
- **Themenfeld-Filter** in der Bibliothek ergänzt (zusätzlich zum bestehenden Funktion-Filter).
- **Neuer Quellentyp** „Doktorarbeit/wissenschaftliche Arbeit" (`dissertation`) - Migration 0027.
- **DOI-Nachreicherung:** Neue Edge Function `fetch-crossref-metadata` (portiert aus `worker/littool_worker/crossref.py`) - Speichern mit neuer/geänderter DOI reichert automatisch leere Felder aus Crossref an (nur leere Felder, nie überschreiben), gleiche Regel wie beim Ingest. Live getestet: Anreicherung funktionierte korrekt, das Speichern schlug danach an der `sources_doi_unique`-Constraint fehl, weil die Test-Quelle sich als echtes, bisher unentdecktes Duplikat einer bereits vorhandenen Quelle herausstellte (Urbach et al. 2019) - Fehler wurde sichtbar angezeigt, keine Teilspeicherung, DB blieb unverändert. Bestätigt: gleiche Sorte Duplikat wie die bereits bekannten (Reinheimer, Charoensuk) - weiterhin nicht automatisch zusammengeführt, bleibt für spätere manuelle Bereinigung vorgemerkt.
- **Quellen-Detail-Layout umgebaut** (Nutzer-Feedback: PDF-Ansicht zu klein): Metadaten-Formular ist jetzt ein auf-/zuklappbarer Bereich oben (Default zugeklappt, zeigt Kurzinfo Autor/Jahr/Typ), PDF-Viewer volle Breite darunter (`h-[85vh]` statt der alten halben Spalte), Methodenprofil und Zitate darunter. Themenfeld-Zuordnung ist jetzt auch direkt in der Detailansicht sichtbar und änderbar (Chips analog zur Funktion), nicht mehr nur über `/pruefen`.
- **Begriffsklärungen** (kein Code, nur Verständnis): Unterschied zwischen Quelle×FF-Relevanz (0-3, Matrix) und Zitat-Relevanz (1-3, Sterne an der Karte); FF-Ansicht = Arbeitsansicht für gesammelte bestätigte Zitate je Forschungsfrage; Relevanzmatrix = Überblick, welche Quellen wie stark auf welche FF einzahlen (Forschungslücken-Argument); „unbestätigte KI-Zuordnungen" sind eine Summe über fünf verschiedene Dimensionen (Themen, Relevanz, Zitate, Methodenprofil, Funktion), nicht nur Zitate.

Noch offen aus dem gleichen Feedback-Durchgang (Forschungsfragen-Ansicht, Relevanzmatrix): Erklärtext auf beiden Seiten ergänzen, Themenfeld als Filter-/Sortierkriterium auch in der Relevanzmatrix ergänzen.

---

## Danach

Arbeitsplan Phase 4 (Zitat-Häkchen, Verwendet-Ansicht, Literaturverzeichnis-Generator, KI-Verzeichnis-Export, Aktivitätslog) im Chat erstellen – der kleinste Plan, danach kommt die Schreibwerkstatt.
