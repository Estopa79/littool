# Arbeitsplan Phase 2 – Volltext, Embeddings, Suche

Ziel der Phase: Der gesamte Bestand ist im Volltext erfasst, in Chunks mit Seitenzuordnung zerlegt, eingebettet – und über eine kombinierte Volltext- + semantische Suche mit Fundstellen-Sprung durchsuchbar.

Voraussetzung: Phase 1 abgeschlossen (alle Quellen `complete` oder bewusst `grau`).

---

## Paket 0 – Rückblick & Aufräumen ☑

- Kurzer Check mit Claude Code: Gibt es aus Phase 1 offene `needs_review`-Fälle, TODOs oder Provisorien? Liste erstellen, kritisches beheben, Rest dokumentieren.
- Wie viele Quellen sind Scans ohne Textebene? (Bestimmt, wie wichtig der OCR-Pfad in Paket 2 ist.)
- **Fertig, wenn:** Sauberer Ausgangszustand, Scan-Anteil bekannt.

**Notizen:**

*needs_review (88 von 155), aufgeschlüsselt:*
- 53 – weder DOI noch Metadaten automatisch gefunden (v. a. Fachpresse/deutschsprachige Quellen, nicht in Crossref/OpenAlex indiziert)
- 18 – Titelsuche fand etwas, aber zu unsicher (Ähnlichkeitsschwelle nicht erreicht → bewusst nicht automatisch übernommen)
- 11 – Titel-Dubletten-Hinweis (Fuzzy-Check)
- 3 – DOI-Dublette (die übrigen 4 der ursprünglich 7 DOI-Dubletten wurden vom später gelaufenen Fuzzy-Titel-Check überschrieben – siehe Provisorien)
- 3 – Pflichtfelder unvollständig trotz gefundener DOI

Kein kritischer Fund, alles erwartbares Ergebnis der Automatik – echte Redaktionsarbeit für den Nutzer, kein Bug.

*Provisorien / TODOs (dokumentiert, nicht kritisch für Phase 2):*
- `supabase link`/CLI-DB-Zugriff weiterhin nicht eingerichtet – Migrationen laufen manuell im SQL-Editor. Für Phase 2 relevant (pgvector/chunks-Migration kommt in Paket 1), aber kein Blocker.
- Wenn eine Quelle sowohl DOI- als auch Titel-Dublette ist, überschreibt der zuletzt gelaufene Job (`detect-duplicates`) den `status_hint` der DOI-Dublette – Status bleibt korrekt `needs_review`, aber der ursprüngliche DOI-Dublette-Grund geht in der Anzeige verloren. Kein Datenfehler, nur ungenaue Begründung; bei Bedarf später auf Hinweis-Anhängen statt Überschreiben umstellen.
- Keine Lösch-/Zusammenführen-Funktion für bestätigte Dubletten in der App – Bereinigung aktuell nur manuell in Supabase möglich.
- CORE-Rankingliste (Konferenzen) noch nicht beschafft; VHB-Liste deckt nur die Fachbereiche Wirtschaftsinformatik + Strategisches Management ab, SJR nur den Bereich Business/Management/Accounting (bewusste Teillisten aus Paket 6, kein Fehler, aber Grund für gelegentliche "kein Ranking gefunden"-Fälle bei tatsächlich gelisteten Journals außerhalb dieser Bereiche).
- Worker läuft weiterhin nur lokal auf diesem Rechner, kein Deployment/Scheduling.

*Scan-Anteil:* 151 von 155 Quellen haben ein PDF hinterlegt. Davon 1 PDF komplett ohne Textebene (echter Scan), 9 mit einzelnen textlosen Seiten (Deckblätter/Abbildungen), Rest sauber textextrahierbar. OCR-Fallback in Paket 2 ist damit ein Sicherheitsnetz für Einzelfälle, keine Kernanforderung.

## Paket 1 – Schema: Chunks & Suchinfrastruktur ☐

- Migration: pgvector-Extension aktivieren; Tabelle `chunks` (source_id, page, chunk_index, text, embedding vector, tsvector-Spalte).
- FTS-Konfiguration für gemischtsprachigen Bestand (deutsch + englisch): tsvector aus beiden Konfigurationen kombinieren oder `simple` + unaccent – Claude Code soll beide Varianten kurz begründen und eine wählen.
- Indexe: GIN auf tsvector, HNSW auf embedding.
- **Fertig, wenn:** Migration läuft, Test-Chunks per SQL such- und vektorabfragbar.

## Paket 2 – Volltextextraktion (Worker) ☐

- Worker-Job: pro Quelle PDF laden, Text seitenweise extrahieren (PyMuPDF).
- Erkennung „keine/kaum Textebene" → OCR-Fallback (ocrmypdf), danach erneut extrahieren.
- Extraktionsstatus an der Quelle (`extracted`, `ocr_done`, `extraction_failed`).
- **Fertig, wenn:** 10 Testquellen (darunter mind. 1 Scan, falls vorhanden) sauber seitenweise extrahiert sind.

## Paket 3 – Chunking mit Seitenzuordnung ☐

- Chunking-Strategie: ca. 800–1200 Zeichen mit Überlappung, Schnitt bevorzugt an Absatzgrenzen; jeder Chunk trägt Seite + Index. Kapitel-/Abschnittsüberschrift, falls erkennbar, als Kontextpräfix.
- Seitenübergreifende Absätze: Chunk gehört zur Seite, auf der er beginnt.
- **Fertig, wenn:** Stichprobe zeigt: Chunks sind lesbar, Seitenangaben stimmen mit dem PDF überein (manuell 5 Fälle prüfen!).

## Paket 4 – Embeddings ☐

- **Entscheidung nötig (siehe unten):** Embedding-Anbieter. Vorschlag: Voyage AI (`voyage-3.5`) per API – starke Qualität auf wissenschaftlichem, gemischtsprachigem Text; Alternative kostenlos: `gte-small` via Supabase Edge Function (schwächer bei Deutsch/Englisch gemischt).
- Worker-Job: alle Chunks einbetten, Batch-weise, mit Wiederaufnahme bei Abbruch.
- **Fertig, wenn:** Kompletter Bestand eingebettet; Kostenkontrolle: einmaliger Lauf, Betrag notieren (bei ~100 Quellen erwartbar einstellig in Euro).

## Paket 5 – Volltextsuche (Backend) ☐

- Suchfunktion (RPC/Edge Function): websearch-Syntax, Treffer mit Quelle, Seite, Snippet mit Hervorhebung (ts_headline), Ranking.
- Filter: Themenfeld (ab Phase 3), Ranking, Quellentyp, Studientyp.
- **Fertig, wenn:** Bekannte Begriffe („dynamic capabilities", deutscher Begriff aus einer grauen Quelle) liefern die erwarteten Stellen.

## Paket 6 – Semantische Suche (Backend) ☐

- Query-Embedding + pgvector-Ähnlichkeitssuche (Cosine, Schwellwert, Top-k), gleiche Rückgabestruktur wie Paket 5.
- **Fertig, wenn:** Eine inhaltliche Frage („Wie wird Vertrauen zwischen Business und IT operationalisiert?") findet passende Stellen, die die Volltextsuche nicht findet.

## Paket 7 – Hybrid-Ranking ☐

- Kombination beider Suchen per Reciprocal Rank Fusion (RRF); Modus wählbar: Hybrid (Standard) / nur Volltext / nur semantisch.
- **Fertig, wenn:** Hybrid liefert bei 5 Testfragen subjektiv die beste Trefferliste.

## Paket 8 – Such-Ansicht (Frontend) ☐

- UI gemäß Wireframe: Suchfeld, Modus-Umschalter, Filter, Trefferkarten (Snippet mit Markierung, Kurzzitation, Seite, Ranking, PDF-Sprung zur Fundstelle).
- Globale Schnellsuche oben rechts springt hierher.
- Mobil vollwertig (Karten, Filter als Bottom-Sheet).
- **Fertig, wenn:** Suche fühlt sich am Desktop und am Handy schnell und brauchbar an.

## Paket 9 – Backfill & Qualitätscheck ☐

- Gesamten Bestand durch Extraktion → Chunking → Embedding laufen lassen; Fehlerfälle abarbeiten.
- Qualitätscheck mit 10 Stichproben: bekannte Textstellen suchen, Seitenangabe im PDF verifizieren, PDF-Sprung testen.
- **Fertig, wenn:** Der komplette reale Bestand durchsuchbar ist → Phase 2 abgeschlossen. 🎉

---

## Entscheidung vor Paket 4: Embedding-Anbieter

| Option | Qualität | Kosten | Aufwand |
|---|---|---|---|
| **Voyage AI voyage-3.5 (Empfehlung)** | sehr gut, mehrsprachig | einmalig wenige Euro für den Bestand, danach Cent-Beträge | API-Key nötig |
| gte-small via Supabase Edge Function | okay, schwächer bei DE/EN gemischt | kostenlos | kein externer Dienst |

Wichtig: Anbieter einmal wählen und dabei bleiben – ein Wechsel bedeutet komplettes Neu-Einbetten (bei diesem Bestand aber verkraftbar).

## Danach

Arbeitsplan Phase 3 (Forschungsfragen, Themen-Zuordnung, Passagen, Übersetzung, Paraphrase, Methodenprofile, QS-Workflow) im Chat erstellen – dort fällt auch die Entscheidung „Übersetzung on demand vs. vorab".
