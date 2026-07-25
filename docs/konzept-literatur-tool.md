# Konzept: Persönliches Literatur- und Recherche-Tool („LitTool")

**Version 0.4 · Juli 2026 · Grundlage für die Umsetzung mit Claude Code**

---

## 1. Ausgangslage und Problem

Für die Doktorarbeit (Business-IT Alignment als dynamische und soziale Fähigkeit in der deutschen Schaden-/Unfallversicherung) liegen knapp über 100 wissenschaftliche PDFs vor, darunter graue Literatur ohne DOI (v. a. für die Einleitung). Der Weg läuft über drei Dokumente: **ISP (individuelle Studienprüfung) → Exposé → Dissertation**, mit teilweiser Übernahme von Inhalten. Die Gliederung ist vorgegeben und steht bereits.

Die bisherige Verwaltung mit Citavi ist zu komplex: Datenimport umständlich, Zusammenspiel mit KI-Werkzeugen und Word unbefriedigend, der Weg von der Quelle zur verwertbaren, korrekt zitierten Passage zu lang.

**Kernproblem:** Es fehlt ein schlankes Werkzeug, das die Quellen automatisch erschließt, sie auf die Forschungsfragen bezieht, belegbare zitierfähige Antworten liefert – und das Schreiben als Ko-Autoren-Team unterstützt.

## 2. Zielbild

Eine abgesicherte Webanwendung (von überall erreichbar), die:

1. alle PDFs automatisch einliest und mit Metadaten anreichert,
2. den Publikationsort gegen anerkannte Rankings prüft (VHB, SJR, ggf. CORE),
3. die Quellen thematisch entlang der Forschungsfragen einordnet,
4. relevante Passagen markiert – Seitenangabe, korrekte Zitation, Sprung zur Fundstelle,
5. Volltext- und semantische Suche über den gesamten Bestand bietet,
6. eine **Schreibwerkstatt** bereitstellt: KI-Agenten entwerfen belegte Textvorschläge entlang der Gliederung, diskutieren untereinander und mit dem Autor,
7. verwendete Zitate per Häkchen erfasst und daraus ein alphabetisches Literaturverzeichnis erzeugt,
8. die KI-Nutzung automatisch protokolliert (**KI-Verzeichnis**) und die Arbeitstage erfasst (**Aktivitätslog** fürs Dissertationsprotokoll).

### Leitprinzipien

- **Belegbarkeit vor Eloquenz:** Jede inhaltliche Aussage des Systems verweist auf Quelle + Seite. Keine Antwort ohne Fundstelle.
- **Vorschläge, nie Endtext:** Agenten-Entwürfe sind Denkmaterial. Der Autor prüft jede Quelle, diskutiert, passt Ton und Inhalt an und macht sich den Text zu eigen. Die KI-Nutzung wird gemäß Hochschulvorgabe im KI-Verzeichnis offengelegt.
- **Schlank bleiben:** Nur Funktionen, die den Weg von Quelle zu Text verkürzen. Kein Citavi-Nachbau.
- **Forschungsfragen als Anker:** Thema und Forschungsfragen sind zentrale Konfiguration; alles wird darauf bezogen.
- **Zitierstandard:** APA 7, erweitert um Pflicht-Seitenzahl bei jeder Zitation („Autor, Jahr, S. x" – auch bei sinngemäßen Zitaten).

## 3. Architektur: Web statt lokal

Stack analog Valmora-Chroniken:

- **Supabase:** Postgres (Daten), pgvector (Embeddings), Postgres-FTS (Volltext), Storage (PDFs, privater Bucket), Auth (Single-User, Row Level Security).
- **Frontend:** Schlanke React-Oberfläche, von jedem Gerät erreichbar.
- **Verarbeitung:** Edge Functions bzw. kleiner Worker (Python) für PDF-Extraktion (PyMuPDF, OCR-Fallback), Metadaten-Anreicherung, Embeddings.
- **KI:** Claude-API für Analyse, Übersetzung, Agenten, Chat.

## 4. Module

### Modul 1 – Ingest & Metadaten (MVP-Kern)

- PDF-Upload (einzeln und als Stapel).
- DOI-Extraktion aus PDF-Metadaten und ersten Seiten (Regex + Fallback: Titel-Suche via Crossref).
- Metadaten-Anreicherung via **Crossref** und **OpenAlex**: Autoren, Titel, Venue, Jahr, Band, Heft, Seiten, Abstract, Zitationszahlen.
- **Mehrstufiger Ranking-Check:** zuerst VHB JOURQUAL, dann Scimago SJR, ggf. CORE für Konferenzen. Ergebnis pro Quelle: z. B. „VHB B", „SJR Q1" oder „kein Ranking gefunden" – filterbar, relevant für die Matrix. Ranking-Listen einmalig als CSV hinterlegen.
- **Manueller Erfassungsdialog für graue Literatur / Quellen ohne DOI** (bereits im MVP).
- Metadaten-Korrektur; Dublettenerkennung über DOI bzw. Titel-Ähnlichkeit.

### Modul 2 – Index & Suche (MVP-Kern)

- Volltextextraktion (Text-PDFs direkt; OCR-Fallback für Scans).
- Chunking mit Seitenzuordnung – jeder Chunk kennt Quelle **und** Seite.
- Embeddings (pgvector) für semantische Suche; klassische Volltextsuche parallel.
- Ergebnis: Passage, Kurzzitation, Seite, Ranking, Link zur Fundstelle im PDF.

### Modul 3 – Analyse-Layer

- Konfiguration: Thema + Forschungsfragen (FF1…FFn) + Themenfelder.
- **Automatische Einordnung:** Claude ordnet jede Quelle Themenfeldern zu (Mehrfachzuordnung/Schnittmengen erwünscht) und bewertet die Relevanz pro Forschungsfrage.
- **Passagen-Extraktion:** Pro Forschungsfrage eine Übersicht aller einzahlenden Passagen – Original, deutsche Übersetzung, Kurzzitation, Deep-Link ins PDF.
- **Paraphrase auf Knopfdruck:** Markierten Originaltext (Passage oder freie Auswahl im Text) per Klick paraphrasieren lassen – Ergebnis ist ein sinngemäßes Zitat mit korrekter Zitation (Autor, Jahr, S. x), als prüfbarer Vorschlag neben dem Original. Übernahme nur nach Prüfung; jede Paraphrase landet im KI-Verzeichnis.
- **Methodenprofil je Quelle:** Claude extrahiert automatisch das Studiendesign – Studientyp (qualitativ / quantitativ / mixed / konzeptionell / Literaturreview), Methode (z. B. Fallstudie, Survey, PLS-SEM, Interviews), Datengrundlage/Sample, Auswertungsverfahren. Angezeigt in Bibliothek und Quellen-Detail, filterbar, bestätigbar im QS-Workflow; Grundlage für Methodentabellen (Deskriptionsmatrix).
- Matrix-Ansicht: Quellen × Forschungsfragen (Vorstufe zu Deskriptions-/Stringenzmatrix).
- QS-Workflow: KI-Zuordnungen bestätigen/korrigieren.

### Modul 4 – Verwendungs-Tracking & Verzeichnisse

- **Zitat-Häkchen:** Jede Passage/Quelle als „verwendet" markierbar (pro Dokument, s. Modul 5).
- Ansicht „Verwendet": alle angehakten Zitate mit Kurzzitation zum Kopieren.
- **Literaturverzeichnis auf Knopfdruck:** alphabetisch nach Erstautor (APA 7 – Zitationsreihenfolge irrelevant), zum Kopieren ins Word-Dokument.
- **KI-Verzeichnis automatisch:** Jede relevante KI-Aktion (Übersetzung, Textvorschlag, Zitatvorschlag, Analyse) wird protokolliert – Datum, Art, betroffener Abschnitt. Export als kopierbare Tabelle gemäß Hochschulvorgabe.
- **Aktivitätslog fürs Dissertationsprotokoll:** Aus den ohnehin vorhandenen Zeitstempeln entsteht eine Monats-/KW-Übersicht: an welchen Tagen wurde was im Tool getan. Bewusst als Gedächtnisstütze fürs händische Hochrechnen (das Tool sieht nur Tool-Arbeit – Lesen, Word, Gespräche bleiben außen vor).

### Modul 5 – Schreibwerkstatt (Ko-Autoren-Modell)

- **Dokumente-Ebene:** ISP, Exposé, Dissertation als eigene Dokumente mit der vorgegebenen Gliederung (Kapitel/Abschnitte, verknüpft mit Forschungsfragen und Themenfeldern). Abschnitte samt Quellen, Passagen und Entwürfen lassen sich von einem Dokument ins nächste übernehmen (ISP → Exposé → Diss).
- **Drei-Spalten-Ansicht pro Abschnitt:** links Textentwurf, Mitte verwendete Passagen (jede Aussage verlinkt auf Quelle + Seite), rechts Diskussionsfaden.
- **Agenten-Entwürfe:** Ein Agent schreibt auf Basis der zugeordneten Passagen einen belegten Entwurf; andere Agenten (z. B. kritischer Professor) hinterfragen ihn sichtbar im Faden; der Autor diskutiert mit („Warum diese Quelle?", „Ich interpretiere das anders, weil …") und entscheidet.
- **Eigener Text prüfbar:** Autor fügt eigenen Text ein und lässt prüfen: Passt das hierher? Ist das belegt? Ist das abwegig?
- Entwürfe versioniert; übernommene Zitate wandern automatisch in die Verwendet-Liste; alle Agenten-Aktionen landen im KI-Verzeichnis.
- **Personas** frei definierbar (Name, Rolle, Haltung, Kritikstil); zusätzlich freier Chat über den Bestand (gefiltert nach Themenfeld, Ranking, Quellen), Verläufe gespeichert und durchsuchbar.

### Modul 6 – Spätere Erweiterungen

- Quellentyp „Eigene Notizen": einmaliger Confluence-Export-Import (keine Live-Anbindung). Miro wird nicht angebunden; Bilder/Modelle bei Bedarf manuell übernehmen.
- BibTeX-Export, automatische Tabellen (z. B. Quellen nach Ranking, **Methodenübersicht/Deskriptionsmatrix aus den Methodenprofilen**) und Grafiken.
- Externe Datenbank-Suche (z. B. OpenAlex) direkt aus dem Tool.

## 5. Datenmodell (Kern-Entitäten)

| Entität | Wichtigste Felder |
|---|---|
| **Source** | id, doi (optional), typ (journal/konferenz/buch/grau), titel, autoren, jahr, venue, ranking_system, ranking_wert, seiten, abstract, storage_pfad, status, **studientyp, methode, sample, auswertung, methoden_bestätigt** |
| **Chunk** | id, source_id, seite, text, embedding |
| **ResearchQuestion** | id, kürzel (FF1…), text |
| **Topic** | id, name, beschreibung |
| **SourceTopic** | source_id, topic_id (n:m → Schnittmengen) |
| **Passage** | id, source_id, seite, original, übersetzung, **paraphrase**, rq_id, relevanz, zitation, bestätigt |
| **Document** | id, typ (ISP/Exposé/Dissertation), titel, status |
| **Section** | id, document_id, eltern_id, nummer, titel, rq_ids, topic_ids |
| **Draft** | id, section_id, version, text, passage_ids, erstellt_von (Agent/Autor), status |
| **DiscussionEntry** | id, section_id, draft_id, autor (Persona/User), text, zeitstempel |
| **UsedCitation** | passage_id, document_id (Häkchen pro Dokument) |
| **Persona** | id, name, rolle, systemprompt |
| **AiLogEntry** | id, datum, art (Übersetzung/Entwurf/Zitatvorschlag/Analyse), section_id/source_id, kurzbeschreibung |
| **ActivityLog** | datum, aktionstyp, referenz (abgeleitet aus Zeitstempeln) |

## 6. Ansichten (Oberfläche, Grobstruktur)

1. **Bibliothek** – Quellentabelle (Titel, Autoren, Jahr, Venue, Ranking, Themen, Status), Filter, Upload, Erfassungsdialog graue Literatur; Detailseite mit Metadaten, PDF-Viewer, Passagen.
2. **Forschungsfragen** – FF-Auswahl links, einzahlende Passagen als Karten rechts (Original, Übersetzung, Zitation, Häkchen, PDF-Sprung); Matrix Quellen × FF.
3. **Suche** – kombinierte Volltext- + semantische Suche, Passagen-Karten mit Beleg.
4. **Schreibwerkstatt** – Dokument- und Gliederungsbaum, Drei-Spalten-Ansicht (Entwurf / Passagen / Diskussion), Agenten-Steuerung.
5. **Verwendet** – angehakte Zitate pro Dokument, Literaturverzeichnis-Generator.
6. **Protokolle** – KI-Verzeichnis-Export, Aktivitätsübersicht (Monat/KW).

*Startansicht beim Öffnen: Schreibwerkstatt (kapitelorientiertes Arbeiten ist der Hauptworkflow).*

## 7. Umsetzungsphasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1 (MVP)** | Upload, DOI/Metadaten, Ranking-Check, Erfassungsdialog graue Literatur, Bibliothek | Alle ~100 PDFs sauber erfasst und filterbar |
| **2** | Volltext + semantische Suche mit Fundstellen | Durchsuchbarer Bestand mit Belegen |
| **3** | Forschungsfragen, Themen-Zuordnung, Passagen-Übersichten mit Übersetzung, QS-Workflow | Kernnutzen für die Arbeit |
| **4** | Zitat-Häkchen, Verwendet-Ansicht, Literaturverzeichnis, KI-Verzeichnis, Aktivitätslog | Schreib- und Nachweis-Support |
| **5** | Schreibwerkstatt: Dokumente/Gliederung, Agenten-Entwürfe, Diskussion, Versionierung | Ko-Autoren-Modell |
| **6** | Confluence-Import, BibTeX, Tabellen, Grafiken, externe Datenbanken | Ausbau |

## 8. Nicht-Ziele

- Kein vollständiger Citavi-Ersatz (keine Aufgabenverwaltung o. Ä.).
- Kein Word-Plugin (alles per Kopieren/Einfügen).
- Keine Miro-Anbindung, keine Live-Confluence-Anbindung.
- Kein Mehrbenutzerbetrieb.
- Keine vollautomatische Zeiterfassung (Aktivitätslog ist bewusst nur Gedächtnisstütze).

## 9. Offene Punkte

1. **Übersetzungen:** on demand oder beim Ingest vorab für alles? (Kostenfrage)
2. **Ranking-Listen:** Verfügbarkeit/Nutzungsbedingungen von VHB- und SJR-Daten als CSV beim Bauen prüfen.
3. **Gliederung erfassen:** vorgegebene Gliederung der ISP als erstes Dokument anlegen (Import aus Word/Text prüfen).
4. **Detail-Wireframes:** Ansichten 1–6 vor Umsetzung als Text-Wireframes durchsprechen.
