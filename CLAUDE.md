# CLAUDE.md – LitTool

Persönliches Literatur- und Recherche-Tool für eine Doktorarbeit (Business-IT Alignment, deutsche Schaden-/Unfallversicherung). Single-User-Webanwendung. Ersetzt Citavi in genau den Punkten, die dort nicht funktionieren: automatischer Ingest, Forschungsfragen-Bezug, belegte Zitate, Ko-Autoren-Schreibwerkstatt.

## Referenzdokumente (immer zuerst lesen)

- `docs/konzept-literatur-tool.md` – vollständiges Konzept (v0.6): Module, Datenmodell, Phasen
- `docs/wireframes-littool.md` – Ansichten, Layout, Design-Entscheidungen
- `docs/arbeitsplan-phase-1.md` – Phase 1 (abgeschlossen)
- `docs/arbeitsplan-phase-2.md` – Phase 2 (abgeschlossen)
- `docs/arbeitsplan-phase-3.md` – **aktueller Arbeitsplan** (inkl. eingeschobener Pakete K, B und F)
- `docs/ideen-spaeter.md` – geparkte Ideen; NICHTS daraus umsetzen, solange es in keinem Arbeitsplan steht
- `docs/Evaluationsmatrix_Interaktiv.html` – Design-Referenz und Startdaten für die Evaluationsmatrix (Pakete 11/12)

Bei Widersprüchen gilt: Arbeitsplan > Wireframes > Konzept. Änderungen an Scope oder Architektur nie stillschweigend vornehmen – immer erst vorschlagen.

## Unverhandelbare Prinzipien

1. **Belegbarkeit:** Jede KI-generierte inhaltliche Aussage verweist auf Quelle + Seite. Keine Antwort, kein Entwurf ohne Fundstelle. Lieber „dazu habe ich keine Quelle" als eine unbelegte Behauptung.
2. **Zitierstandard:** APA 7, erweitert um Pflicht-Seitenzahl bei JEDER Zitation, auch sinngemäß: (Autor, Jahr, S. x).
3. **KI-Transparenz:** Jede relevante KI-Aktion (Übersetzung, Entwurf, Zitatvorschlag, Analyse) erzeugt einen AiLogEntry. Das ist Pflicht für das KI-Verzeichnis der Hochschule – niemals weglassen oder „später nachrüsten".
4. **Schlank bleiben:** Kein Feature bauen, das nicht im Konzept steht. Bei Ideen: vorschlagen, nicht umsetzen.
5. **Single-User:** Keine Mehrbenutzer-Logik, aber Auth + RLS von Anfang an (App ist öffentlich erreichbar).

## Tech-Stack

- **Backend/DB:** Supabase – Postgres, pgvector (Embeddings), Postgres-FTS (deutsch + englisch), Storage (privater Bucket `pdfs`), Auth, Edge Functions.
- **Frontend:** React + Vite + TypeScript, Tailwind. Mobile-First, PWA (installierbar). Drei-Spalten-Ansichten werden < 768px zu Tabs.
- **Worker:** Python 3.12 (Verzeichnis `worker/`) für PDF-Verarbeitung: PyMuPDF (Text + Seiten), ocrmypdf (Fallback für Scans), Crossref-/OpenAlex-Anreicherung, Embeddings, Ranking-Matching.
- **KI:** Claude-API (claude-sonnet-4-6 als Standard; Agenten-Debatten ggf. stärkeres Modell). API-Key nur über Umgebungsvariablen, nie ins Repo.
- **Lange Aktionen** (Entwurf, Debatte, Batch-Ingest): asynchrone Jobs mit Status in der DB; Frontend pollt. Muss weiterlaufen, wenn der Client (Handy) die Seite verlässt.

## Repo-Struktur

```
littool/
├── CLAUDE.md
├── docs/                  # konzept.md, wireframes.md, arbeitsplan-phase-1.md
├── supabase/
│   ├── migrations/        # SQL-Migrationen, fortlaufend nummeriert
│   └── functions/         # Edge Functions
├── frontend/              # React + Vite + TS
│   └── src/
│       ├── views/         # bibliothek, forschungsfragen, suche,
│       │                  # schreibwerkstatt, verwendet, protokolle
│       ├── components/
│       └── lib/           # supabase-client, api-helpers
├── worker/                # Python: ingest, enrich, embed, rank
│   ├── pyproject.toml
│   └── littool_worker/
└── data/rankings/         # vhb.csv, sjr.csv (einmalig hinterlegt)
```

## Datenmodell

Kern-Entitäten (Details in `docs/konzept.md`, Abschnitt 5): Source, Chunk, ResearchQuestion, Topic, SourceTopic, Passage, Document, Section, Draft, DiscussionEntry, UsedCitation, Persona, AiLogEntry, ActivityLog.

Regeln:
- Tabellen- und Spaltennamen englisch, snake_case; UI-Texte deutsch.
- Jeder Chunk und jede Passage speichert `page` – ohne Seite kein Speichern.
- **Zwei Seitenbegriffe strikt trennen:** PDF-Seite (für den Viewer-Sprung) vs. Zitationsseite (= PDF-Seite + `page_offset` der Quelle). Offset beim Ingest aus Crossref (erste Journal-Seite) ableiten, manuell korrigierbar. Zitations-Strings NIE fest speichern, sondern immer aus PDF-Seite + Offset generieren – eine Offset-Korrektur heilt so alle Zitate der Quelle.
- `UsedCitation` ist pro Dokument (eine Passage kann in ISP verwendet sein, in der Diss nicht).
- Schemaänderungen ausschließlich über neue Migrationen, nie bestehende editieren.

## Datensicherung (Pflicht)

- `scripts/backup.sh`: DB-Dump (Supabase CLI) + Sync des PDF-Buckets an einen zweiten Ort. Wöchentlich ausführen (Job oder Erinnerung).
- Vor jeder Migration: manueller Dump.
- Restore einmal testweise durchspielen.

## Arbeitsweise

- **Ein Arbeitspaket pro Sitzung** aus `docs/arbeitsplan-phase-1.md`, in der Reihenfolge des Plans. Nach jedem Paket: kurzer Test, Commit mit sprechender Message (`feat: …`, `fix: …`), Haken im Arbeitsplan setzen.
- Vor dem Bauen einer Ansicht: zugehöriges Wireframe in `docs/wireframes.md` lesen.
- Fehlerbehandlung sichtbar machen: Ingest-Fehler (keine DOI, OCR nötig, Crossref leer) landen als Status an der Quelle, nie stillschweigend verschluckt.
- Keine Platzhalter-Daten in Produktionscode; Testdaten nur in Seeds/Fixtures.
- Deutsch als Sprache für UI, Kommentare optional englisch.

## Externe Dienste

- **Crossref REST API** (DOI → Metadaten): höflicher User-Agent mit Mailto, Rate-Limits respektieren.
- **OpenAlex** (Fallback + Zitationszahlen, Venue-Infos): dito.
- **Ranking-CSVs** in `data/rankings/`: Matching über normalisierte Journal-/Konferenznamen und ISSN, Reihenfolge VHB → SJR → CORE; Ergebnis + Herkunft an der Quelle speichern („VHB B", „SJR Q1", „kein Ranking gefunden").
