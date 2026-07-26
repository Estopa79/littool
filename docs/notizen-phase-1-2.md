# Notizen Phase 1 & 2 – Entscheidungen, Workarounds, Besonderheiten

Querschnitts-Referenz zu `arbeitsplan-phase-1.md` und `arbeitsplan-phase-2.md`. Die Arbeitspläne dokumentieren chronologisch, was in welchem Paket passiert ist – dieses Dokument bündelt die Dinge, die paketübergreifend gelten oder nirgends sonst schriftlich festgehalten sind: Infrastruktur/Zugänge, Architektur-Entscheidungen mit Begründung, wiederkehrende Fehlerklassen samt Workaround, und der aktuelle Stand offener Punkte.

---

## 1. Infrastruktur & Zugänge

- **Supabase-Projekt:** `wnbbisrchufrgvgdhicu` (Region eu-west-3), Postgres 17. Owner-Account `ruben.beltran@web.de`.
- **App-Login (Single-User):** `beltran.ollero@googlemail.com`, per Admin-API angelegt, Selbstregistrierung im Dashboard deaktiviert.
- **GitHub-Repo:** `https://github.com/Estopa79/littool` (Owner: Estopa79).
- **Deployment:** Vercel, automatischer Deploy bei jedem `git push` auf `master`. Root Directory in den Vercel-Projekteinstellungen auf `frontend/` gesetzt (kein `vercel.json` im Repo, Konfiguration liegt nur im Vercel-Dashboard). Live-URL: `https://littool.vercel.app`.
- **Supabase-CLI:** Seit Paket 8 (Phase 2) eingerichtet und mit dem Projekt verlinkt (`npx supabase login` interaktiv durch den Nutzer, dann `npx supabase link --project-ref wnbbisrchufrgvgdhicu`). Davor (Migrationen 0001–0012) liefen alle Migrationen manuell per Copy-Paste im Supabase-SQL-Editor, weil kein CLI-DB-Zugriff bestand – **dieser manuelle Weg bleibt weiterhin die Norm für Migrationen** (Datenbankänderungen), nur Edge-Function-Deployment läuft jetzt über die CLI (`npx supabase functions deploy <name>`). Migrationen laufen bewusst nicht über `supabase db push`, um die etablierte "Nutzer führt SQL im Editor aus, bestätigt mit 'erledigt'"-Routine beizubehalten.
- **Edge-Function-Secrets:** `VOYAGE_API_KEY` ist über `npx supabase secrets set` hinterlegt (nicht in `.env` der Edge Function, die läuft serverseitig bei Supabase, nicht im Worker-Kontext).
- **Umgebungsvariablen-Inventar:**
  - `.env` (Worker/Skripte, nie committen): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (noch ungenutzt, erst KI-Phasen), `CROSSREF_MAILTO`, `OPENALEX_MAILTO`, `VOYAGE_API_KEY`.
  - `frontend/.env` (Vite, nur `VITE_`-Präfix wird gebündelt): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **Niemals** einen Service-Role- oder Voyage-Key hierhin – landet sonst im öffentlichen Browser-Bundle.
  - Dieselben Variablen sind zusätzlich in den Vercel-Projekteinstellungen hinterlegt (für den Produktiv-Build) und – wo relevant (`VOYAGE_API_KEY`) – als Supabase-Edge-Function-Secret.
- **Lokale Systemvoraussetzungen (nur auf diesem Windows-Rechner nötig, nicht im Repo-Code):** Tesseract OCR + Ghostscript (per `winget`, Ghostscript teils vom offiziellen GitHub-Release statt winget-Paket), deutsches Tesseract-Sprachpaket. Liegen wegen fehlender Schreibrechte auf `Program Files` in `worker/.tessdata/` (gitignored), `TESSDATA_PREFIX` und `PATH`-Ergänzung passieren zur Laufzeit in `fulltext.py:_ensure_ocr_env()`.
- **Worker-Deployment:** Der Python-Worker läuft ausschließlich lokal auf diesem Rechner, kein Hosting/Scheduling. Alles, was live vom Frontend aus erreichbar sein muss (z. B. die Suche), läuft deshalb über Supabase Edge Functions statt über den Worker.

## 2. Architektur-Entscheidungen (mit Begründung)

| Entscheidung | Begründung | Quelle |
|---|---|---|
| Voyage AI `voyage-3.5`, 1024 Dimensionen, statt kostenlosem `gte-small` | Deutlich bessere Qualität bei gemischt deutsch-/englischsprachigem Fachtext; Kosten für diesen Bestand vernachlässigbar (~$0,32 einmalig) | Phase 2, Paket 1/4 |
| Kombiniertes FTS (`to_tsvector('german', …) \|\| to_tsvector('english', …)`) statt `simple`+unaccent | Chunks sind nicht pro Zeile nach Sprache getaggt; Stemming in beiden Sprachen wichtiger für Recall als etwas größerer Index | Phase 2, Paket 1 |
| `authors` als `jsonb`-Array (`{family, given}`) statt Freitext | Spätere APA-Zitation/Sortierung nach Erstautor muss nicht neu geparst werden | Phase 1, Paket 2 |
| Methodenprofil-Felder (Studientyp, Methode, Sample, Auswertung) bewusst nicht in Phase 1 angelegt | Kommen erst mit Modul 3/Phase 3 in eigener Migration | Phase 1, Paket 2 |
| Absatzbasiertes Chunking, ~1000/max 1200 Zeichen, ~150 Zeichen Überlappung; Seite = Seite des ersten **eigenen** Absatzes (Überlappung zählt nicht) | Seitenübergreifende Absätze brauchen eine eindeutige Regel; Überlappung dient nur dem Kontext, nicht der Seitenzuordnung | Phase 2, Paket 3 |
| Suche als Postgres-Funktionen (`search_fulltext`, `search_semantic`, `search_hybrid`) statt Anwendungslogik im Frontend | Gleiche Rückgabestruktur über alle drei Suchmodi hinweg, direkt per RLS-Grant absicherbar (`to authenticated`) | Phase 2, Paket 5–7 |
| Hybrid-Suche per Reciprocal Rank Fusion (k=60), Kandidatenlisten auf `match_limit*3` begrenzt | Kombiniert Wortlaut- und Bedeutungstreffer, ohne den ganzen Bestand pro Zweig zu materialisieren | Phase 2, Paket 7 |
| Query-Embedding läuft in einer Supabase Edge Function, nicht im Frontend | Voyage-Key darf nicht ins Browser-Bundle; Edge Function hält den Key serverseitig und reicht die Anfrage mit dem Auth-Header des Nutzers weiter (kein Service-Role-Bypass) | Phase 2, Paket 8 |
| Snippet-Hervorhebung über Private-Use-Area-Sentinels (U+E000/U+E001) statt literaler `<mark>`-Tags | `ts_headline`-Ausgabe landet per `dangerouslySetInnerHTML` im DOM; Sentinels + Escapen-dann-Ersetzen verhindert eine XSS-Lücke über zufällige `<`/`>` im PDF-Text | Phase 2, Paket 8 |
| PDF-Viewer nutzt den nativen Browser-PDF-Viewer (`iframe` + `#page=N`), kein PDF.js | Einfacher, für "anzeigen + Seitensprung" ausreichend | Phase 1, Paket 8 |

## 3. Wiederkehrende Fehlerklassen & Workarounds

Diese Muster sind mehrfach aufgetreten oder haben Bestandsbreite Auswirkung – bei ähnlichen Symptomen zuerst hier nachsehen:

- **RLS ohne GRANT reicht nicht.** `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` allein gibt der Rolle `authenticated` noch keinen Tabellenzugriff – das explizite `GRANT ... TO authenticated` wird oft vergessen. **Für jede neue Tabelle/Funktion: alle drei Teile in derselben Migration.**
- **PostgREST liefert standardmäßig nur eine begrenzte Zeilenzahl zurück.** Ein `.select()` ohne `limit`/`range` deckelt bei einigen tausend Zeilen (genaue Grenze hängt von der Konfiguration ab). Hat einmal dazu geführt, dass eine Existenzprüfung ("ist X schon verarbeitet?") über den ganzen Bestand falsche Ergebnisse lieferte, sobald die Tabelle größer wurde. **Für Existenzprüfungen: gezielt pro Datensatz mit `.limit(1)` abfragen, nicht bulk abziehen und im Code filtern.**
- **pgvector-Suche kann den HNSW-Index stillschweigend verlieren.** Passiert, wenn (a) ein Filter die Distanz ein zweites Mal in der `WHERE`-Klausel berechnet (Planer erkennt die `ORDER BY … LIMIT`-Form dann nicht mehr) oder (b) nach großen Bulk-Inserts/-Updates kein `ANALYZE` gelaufen ist (veraltete Tabellenstatistik verleitet den Planer zu falschen Entscheidungen). Beides führte zu Statement-Timeouts erst bei echter Bestandsgröße, nicht im Kleintest. **Nächste-Nachbarn-Suche immer als eigene Subquery mit direktem `ORDER BY embedding <=> $1 LIMIT n` halten, zusätzliche Filter erst danach auf dem kleinen Ergebnis anwenden; nach großen Bulk-Läufen `VACUUM ANALYZE` nicht vergessen.**
- **Cloudflare-CDN vor Supabase Storage cacht Downloads pro URL.** Nach dem Überschreiben einer Datei am selben Storage-Pfad (z. B. OCR ersetzt das Original) lieferte ein einfacher `download()` teils dauerhaft die alte Version zurück, obwohl der Upload serverseitig korrekt durchgelaufen war. Fix: zentraler `download_pdf()`-Helper mit zufälligem Cache-Buster-Query-Parameter bei jedem Aufruf (`worker/littool_worker/supabase_client.py`).
- **Kaputtes CID-Font-Mapping in PDFs** (Buchstaben werden auf falsche Unicode-Codepoints gemappt) tritt in zwei Ausprägungen auf, die unterschiedlich behandelt werden müssen:
  1. **Nur die Textebene ist betroffen**, das gerenderte Bild ist visuell korrekt → `ocrmypdf --force-ocr` liest die richtigen Pixel und repariert den Text vollständig (3 bestätigte Fälle: MaRisk VA, Business-IT-Alignment 2017 + sein Duplikat).
  2. **Das Rendering selbst ist fehlerhaft** (der Font zeichnet an bestimmten Stellen falsche Glyphen) → OCR liest dieselben falschen Pixel, keine Reparatur möglich (2 bestätigte, unreparierbare Fälle, beide Duplikate desselben Springer-Artikels, DOI 10.1007/BF03353515).
  - Erkennung ist unzuverlässig: reine Zeichenanzahl pro Seite (`MIN_CHARS_PER_PAGE`) und Alphabet-Anteil (`MIN_ALPHA_RATIO`) greifen nicht, weil die kaputten Zeichen trotzdem "Buchstaben" sind. Ein Stoppwort-Anteil-Signal wurde ergänzt (`fulltext.py:needs_ocr`), erkennt aber nachweislich nur **vollständig** verschlüsselte Dokumente zuverlässig, nicht partielle Korruption einzelner Wörter/Überschriften innerhalb einer sonst sauberen Seite (getestet und als Grenze dokumentiert, siehe Phase 2 Paket 9). **Automatisierte Erkennung hat also eine bekannte Lücke – Stichproben mit direktem Blick in Chunk-Text vs. Original-PDF bleiben nötig.**
- **Windows-spezifische Umgebungsprobleme** (dieser Rechner, nicht der App-Code):
  - Frisch per `winget` installierte Programme (Tesseract, Ghostscript) sind der laufenden Shell-Session noch nicht bekannt → PATH wird zur Laufzeit im Code ergänzt statt auf Neustart zu warten.
  - Python/httpx fand anfangs den lokalen Zertifikatsspeicher nicht (`CERTIFICATE_VERIFY_FAILED`) → `pip-system-certs` behebt das dauerhaft (feste Worker-Dependency).
  - `curl` mit dem Windows-Schannel-Backend kann mit `CRYPT_E_NO_REVOCATION_CHECK` fehlschlagen (Zertifikats-Sperrprüfung nicht möglich) → nur für manuelle Diagnose-Aufrufe relevant, Workaround `--ssl-no-revoke`. Betrifft nicht den App-Code selbst (Browser/Deno/Python-Stacks sind davon nicht betroffen).
  - Windows-Konsole (cp1252) kann nicht jedes Unicode-Zeichen aus Quellentiteln darstellen → `sys.stdout` wird im Worker-CLI (`cli.py`) auf UTF-8 mit Ersatzzeichen umgestellt.
- **CORS wird von curl-Tests nicht aufgedeckt.** Server-zu-Server-Aufrufe (curl, Worker) brauchen keinen Browser-Preflight – eine Edge Function kann also curl-getestet "funktionieren" und trotzdem im echten Browser an einem fehlenden `OPTIONS`-Handling scheitern. Bei jeder neuen Edge Function, die vom Frontend aus aufgerufen wird, von Anfang an CORS-Header + `OPTIONS`-Handling einplanen.
- **Kosmetisches Zähl-Artefakt bei Hintergrund-Läufen:** mehrfach beobachtet, dass die von einem Worker-Job selbst ausgegebene Zusammenfassung (z. B. "0 extracted, 0 ocr_done") niedriger lag als der tatsächliche Datenbankstand. Ursache nie abschließend geklärt. **Bei Zweifeln immer den DB-Stand direkt per REST-Abfrage verifizieren, nicht der Job-Konsolenausgabe allein vertrauen.**

## 4. Bekannte Grenzen & offene Punkte (Stand: Ende Phase 2)

- **Mögliche echte Dublette unentschieden:** `a9b67153…` ("Business-IT-Alignment 2017") und `fd100f96…` ("Business-IT-Alignment: Gemeinsam zum Unternehmenserfolg") sind vermutlich dieselbe Quelle zweimal erfasst (identischer Original-Dateiname). Von der Dubletten-Erkennung aus Phase 1 nicht erkannt, weil weder DOI noch Titel-Fuzzy-Match nah genug lagen. Bewusst nicht selbst zusammengeführt/gelöscht – wartet auf eine Entscheidung des Nutzers.
- **2 Quellen mit unreparierbarem Font-Encoding-Defekt** (`949184f9…`, `95c74c8a…`, Duplikate desselben Springer-Artikels DOI 10.1007/BF03353515) bleiben als `extraction_status = 'extraction_failed'` markiert – kein durchsuchbarer/zitierbarer Text vorhanden, paywalled, keine saubere Alternative gefunden.
- **CORE-Rankingliste (Konferenzen)** noch nicht beschafft; VHB-Liste deckt nur Wirtschaftsinformatik + Strategisches Management ab, SJR nur Business/Management/Accounting – gelegentliche "kein Ranking gefunden"-Fälle bei tatsächlich gelisteten Journals außerhalb dieser Fachbereiche sind dadurch erwartbar, kein Bug.
- **Keine Lösch-/Zusammenführen-Funktion für bestätigte Dubletten** in der App – Bereinigung aktuell nur manuell in Supabase möglich.
- **Worker läuft nur lokal**, kein Hosting/Scheduling – jeder Ingest-/Reparatur-Schritt muss auf diesem Rechner angestoßen werden.
- **needs_ocr()-Heuristik erkennt keine partielle Font-Korruption** (siehe Abschnitt 3) – nur Stichproben schließen diese Lücke zuverlässig.
- **88 Quellen aus Phase 1 sind `needs_review`** (v. a. Fachpresse/deutschsprachige Quellen ohne Crossref/OpenAlex-Indexierung) – erwartbare Redaktionsarbeit für den Nutzer, kein technischer Fehler.

## 5. Etablierte Arbeitsweise

- Ein Arbeitspaket pro Sitzung, in Reihenfolge des jeweiligen Arbeitsplans; nach jedem Paket Commit mit sprechender Message, Haken im Plan gesetzt, Notizen ergänzt.
- Schema-Änderungen ausschließlich über neue, fortlaufend nummerierte Migrationen – bestehende Migrationsdateien werden nie nachträglich editiert (siehe z. B. Migration 0011, die einen Bug aus 0010 behebt, statt 0010 zu ändern).
- Push zum GitHub-Repo (und damit Vercel-Deploy) erfolgt nur nach expliziter Rückfrage, nicht automatisch nach jedem Commit.
- Migrationen werden dem Nutzer als vollständiges SQL präsentiert, im Supabase-SQL-Editor manuell ausgeführt, Bestätigung per Chat ("erledigt"/"ist ausgeführt") – dieser Ablauf bleibt auch nach Einrichtung der Supabase-CLI in Paket 8 die Norm für Datenbank-Änderungen.
- Bei Grenzfällen/Architektur-Entscheidungen (z. B. Edge Function ja/nein, wie mit gefundenen Dubletten umgehen) wird vor der Umsetzung nachgefragt statt still entschieden.
