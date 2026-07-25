# Arbeitsplan Phase 1 – Ingest, Metadaten, Bibliothek

Ziel der Phase: Alle ~100 PDFs sauber erfasst, mit Metadaten und Ranking angereichert, in der Bibliothek filterbar. Graue Literatur manuell erfassbar.

Jedes Paket ist eine Claude-Code-Sitzung. Erledigte Pakete abhaken und ggf. mit Notizen versehen.

---

## Paket 0 – Projektfundament ☑

- Repo initialisieren gemäß Struktur in CLAUDE.md (Ordner, .gitignore, README-Stub).
- Supabase-Projekt verbinden (CLI, `supabase init`, Umgebungsvariablen-Vorlage `.env.example`).
- Frontend-Gerüst: Vite + React + TS + Tailwind, PWA-Grundkonfiguration, Seitenleisten-Navigation mit den sechs Ansichten als leere Platzhalter (mobil: Tab-Leiste unten).
- Worker-Gerüst: Python-Paket mit pyproject, ein Dummy-Kommando.
- **Fertig, wenn:** App startet lokal, Navigation funktioniert am Desktop und im Handy-Viewport, Supabase-Verbindung steht.

**Notizen:** Supabase-Cloud-Projekt (`wnbbisrchufrgvgdhicu`) verlinkt und per REST-API + Worker-CLI verifiziert; `supabase link` (CLI) steht noch aus, braucht interaktiven `supabase login` – nachholen, sobald die erste Migration (Paket 2) ansteht. Lokaler Supabase-Stack via Docker nicht verfügbar/nicht genutzt, stattdessen direkt gegen das Cloud-Projekt entwickelt.

## Paket 1 – Auth & Absicherung ☑

- Supabase Auth: ein einzelner Benutzer (E-Mail + Passwort), Login-Seite, Session-Handling.
- RLS-Grundgerüst: alle künftigen Tabellen nur für authentifizierte Rolle lesbar/schreibbar.
- Privater Storage-Bucket `pdfs` mit Zugriffsregeln.
- **Fertig, wenn:** Ohne Login ist nichts erreichbar; nach Login sieht man die leere App.

**Notizen:** Migrationen (`0001_rls_grundgeruest.sql`, `0002_storage_pdfs_bucket.sql`) manuell im Supabase SQL-Editor angewendet (DB-Zugriff für CLI/`db push` weiterhin nicht eingerichtet – Entscheidung: SQL-Migrationen künftig manuell im Dashboard ausführen, siehe README). Single-User (`beltran.ollero@googlemail.com`) per Admin-API angelegt, Passwort im Chat mitgeteilt. Selbstregistrierung im Dashboard deaktiviert. RLS-Wirkung am `pdfs`-Bucket verifiziert: anonym → 403, eingeloggt → Upload/Liste/Löschen erfolgreich. Login/Logout/Session-Persistenz im Browser getestet (Desktop).

## Paket 2 – Schema: Quellen ☑

- Migration: Tabelle `sources` (Felder gemäß Konzept Abschnitt 5, inkl. `type`, `ranking_system`, `ranking_value`, `status`).
- Statuswerte definieren: `processing`, `needs_review`, `complete`, `failed`.
- Seed mit 2–3 Testquellen.
- **Fertig, wenn:** Migration läuft durch, Testquellen per SQL abfragbar, RLS greift.

**Notizen:** Methodenprofil-Felder (studientyp, methode, sample, auswertung) aus Konzept v0.4 bewusst nicht mit angelegt – kommen erst mit Modul 3/Phase 3 in eigener Migration (Entscheidung im Chat). `authors` als jsonb-Array ({family, given}) statt Freitext, damit spätere APA-Zitation/Sortierung nach Erstautor nicht neu geparst werden muss. Ranking null+null = "kein Ranking gefunden" (bzw. UI zeigt bei type=grau "nicht anwendbar"), kein eigenes Sentinel-Feld. Bug in 0001 gefunden: `alter default privileges ... revoke` allein reicht nicht, RLS-Policy ersetzt kein `GRANT` – fehlendes `GRANT ... TO authenticated` musste in 0005 nachgezogen werden. **Für künftige Tabellen-Migrationen: immer `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` + `GRANT ... TO authenticated` zusammen in einer Migration.** Drei Testquellen (Teece 2007 complete, Wagner 2014 needs_review, BaFin 2023 grau) angelegt und per REST-API verifiziert: anonym 401, eingeloggt 3 Zeilen.

## Paket 3 – PDF-Upload ☑

- Upload-UI in der Bibliothek: Einzel- und Stapel-Upload (Drag & Drop + Dateiauswahl, mobil: Dateiauswahl).
- Dateien landen im Bucket, je Datei ein `sources`-Eintrag mit Status `processing`.
- Fortschrittsanzeige je Datei; Fehler sichtbar.
- **Fertig, wenn:** 5 PDFs gleichzeitig hochladbar, Einträge erscheinen in der DB.

**Notizen:** `sources.type` per Migration 0006 nullable gemacht (Typ ist beim Upload noch unbekannt, kommt erst über Crossref in Paket 5 bzw. den Grau-Dialog in Paket 9). Ablauf pro Datei: erst `sources`-Insert (status=processing, title=Dateiname ohne Endung), dann Upload nach `pdfs/{source_id}/{dateiname}`, dann `storage_path` zurückschreiben; schlägt der Upload fehl, Status → `failed` mit `status_hint`. Nicht-PDF-Dateien werden clientseitig abgewiesen und als Fehler in der Liste angezeigt, ohne DB-Eintrag. Test mit 5 simulierten PDFs + 1 Nicht-PDF im Browser: alle 5 landeten korrekt in Storage + DB (Status processing), Fehlerfall sichtbar; Testdaten danach wieder gelöscht. Bibliothekstabelle/-filter selbst kommen erst in Paket 7 – aktuell nur die Upload-Queue-Ansicht.

## Paket 4 – DOI-Extraktion (Worker) ☑

- Worker-Job: neue Quelle mit Status `processing` abholen, PDF laden, DOI suchen: 1) PDF-Metadaten, 2) Regex auf den ersten 3 Seiten.
- Kein Fund → Status `needs_review` mit Hinweis „keine DOI gefunden".
- Fund → DOI an der Quelle speichern.
- **Fertig, wenn:** Für 10 echte Test-PDFs wird die DOI korrekt erkannt oder sauber als fehlend markiert.

**Notizen:** CLI zu Subcommands umgebaut (`littool-worker status`, `littool-worker extract-doi`). Job holt alle `sources` mit `status=processing` und `doi is null`, lädt PDF aus dem `pdfs`-Bucket (service_role, umgeht RLS bewusst – Worker läuft nicht im Nutzerkontext), sucht DOI zuerst im PDF-Info-Dict, dann per Regex auf den ersten 3 Seiten. Fund → `doi` gesetzt, Status bleibt `processing` (wartet auf Paket 5). Kein Fund → `needs_review` + `status_hint`. Laufzeitfehler pro Datei (Download/Parsing) → `failed` + `status_hint`, Job bricht nicht ab. SSL-Problem auf diesem Rechner entdeckt: Python/httpx fand den lokalen Zertifikatsaussteller nicht (`CERTIFICATE_VERIFY_FAILED`) – behoben mit `pip-system-certs` (nutzt den Windows-Zertifikatsspeicher), jetzt feste Worker-Dependency. Test mit 10 echten PDFs aus dem Bestand (nicht synthetisch): 6 DOIs korrekt gefunden (Elsevier/Springer/Wiley/CAIS-Präfixe plausibel), 4 sauber als `needs_review` markiert, 0 Fehler. Testquellen bewusst nicht gelöscht – sind echte Bestandsdaten und bleiben als Start der echten Bibliothek stehen (Entscheidung im Chat).

## Paket 5 – Metadaten-Anreicherung ☐

- Crossref-Abfrage per DOI: Autoren, Titel, Venue, Jahr, Band, Heft, Seiten, ISSN.
- OpenAlex als Ergänzung: Abstract, Zitationszahl; Fallback-Titel-Suche, wenn Crossref leer.
- Ergebnis an der Quelle speichern; unvollständige Fälle → `needs_review`.
- **Fertig, wenn:** Eine Quelle durchläuft Upload → DOI → Metadaten vollautomatisch bis Status `complete`.

## Paket 6 – Ranking-Matching ☐

- `data/rankings/` anlegen; VHB- und SJR-Liste als CSV beschaffen/hinterlegen (Verfügbarkeit prüfen, sonst Struktur definieren und mit Teilliste starten).
- Matching per ISSN, Fallback normalisierter Venue-Name; Reihenfolge VHB → SJR → CORE.
- Ergebnis + Herkunft speichern; kein Treffer → „kein Ranking gefunden" (kein Fehler).
- **Fertig, wenn:** Bekannte Journals korrekt gerankt werden und der Nicht-Treffer-Fall sauber aussieht.

## Paket 7 – Bibliotheksansicht ☐

- Tabelle gemäß Wireframe: Autor/Jahr, Titel, Venue, Ranking, Status; Filter (Typ, Ranking, Status), Sortierung, Suche im Titel.
- Mobil: Karten statt Tabellenzeilen.
- Statusliste „Prüfen" für alle `needs_review`-Fälle.
- **Fertig, wenn:** Der echte Bestand (erste ~20 PDFs) angenehm durchsuchbar ist.

## Paket 8 – Quellen-Detailseite & Korrektur ☐

- Detailseite: alle Metadaten editierbar, Abstract, Ranking mit Herkunft, PDF-Viewer (anzeigen + Seitensprung, mehr nicht).
- Speichern von Korrekturen setzt Status auf `complete`.
- **Fertig, wenn:** Ein `needs_review`-Fall lässt sich vollständig von Hand heilen.

## Paket 9 – Erfassungsdialog graue Literatur ☐

- Formular für Quellen ohne DOI: Typ, Autoren/Institution, Titel, Jahr, Herausgeber/URL, optional PDF-Upload.
- Landet als `type = grau`, Ranking = „nicht anwendbar".
- **Fertig, wenn:** Ein BaFin-Merkblatt o. Ä. in unter einer Minute erfassbar ist.

## Paket 10 – Dubletten & Stapel-Abschluss ☐

- Dublettenerkennung: gleiche DOI → Warnung beim Upload; ähnlicher Titel (Fuzzy) → Hinweis in „Prüfen".
- Kompletten Bestand (~100 PDFs) einspielen, Fehlerfälle durcharbeiten.
- **Fertig, wenn:** Der gesamte reale Bestand erfasst ist → Phase 1 abgeschlossen. 🎉

---

## Danach

Arbeitsplan Phase 2 (Volltext, Chunking, Embeddings, Suche) gemeinsam mit Claude im Chat erstellen – Erkenntnisse aus Phase 1 fließen ein.
