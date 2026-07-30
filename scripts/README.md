# scripts/verarbeitung.bat

Führt den Teil der Ingest-Pipeline aus, der lokal laufen muss (PDF-Text-Extraktion, OCR-Fallback bei Scans, Chunking) - das kann eine Edge Function nicht übernehmen, weil dafür PyMuPDF (native Python-Bibliothek) und `ocrmypdf` (externes Programm) gebraucht werden.

Führt nacheinander aus:

1. `littool-worker extract-doi` - DOI aus dem PDF lesen
2. `littool-worker extract-fulltext` - Volltext seitenweise extrahieren, OCR-Fallback bei Scans
3. `littool-worker chunk` - Volltext in Abschnitte mit Seitenzuordnung zerlegen

Danach in der Bibliothek auf **„Verarbeitung fortsetzen"** klicken - Metadaten-Anreicherung, Ranking-Matching, Duplikat-Prüfung und Embeddings laufen ab da automatisch server-seitig (Edge Function).

## Benutzung

Datei `verarbeitung.bat` im Datei-Explorer doppelklicken. Ein Konsolenfenster öffnet sich, zeigt den Fortschritt der drei Schritte und bleibt am Ende offen (Taste drücken zum Schließen) - so bleiben Fehlermeldungen lesbar.

## Voraussetzungen (einmalige Einrichtung)

Falls das Skript mit „`.venv` nicht gefunden" oder einer Python-Fehlermeldung abbricht, fehlt eine der folgenden Voraussetzungen.

### 1. Python 3.12 oder neuer

Prüfen: Eingabeaufforderung öffnen, `python --version` eingeben. Falls nicht vorhanden: [python.org/downloads](https://www.python.org/downloads/) - beim Installer **„Add python.exe to PATH"** ankreuzen.

### 2. Worker-Umgebung einrichten

In einer Konsole (z. B. PowerShell) im Projektordner:

```bash
cd worker
python -m venv .venv
./.venv/Scripts/pip install -e .
```

Das installiert alle Python-Abhängigkeiten (u. a. PyMuPDF, `ocrmypdf`, den Supabase-Client) isoliert in `worker/.venv`, ohne die System-Python-Installation zu verändern. Nur einmalig nötig - ein `git pull` überschreibt `.venv` nicht (per `.gitignore` ausgeschlossen).

### 3. `.env`-Datei im Projekt-Hauptordner anlegen

`.env.example` (im Hauptordner) nach `.env` kopieren und ausfüllen:

```
SUPABASE_URL=<Supabase-Projekt-URL>
SUPABASE_SERVICE_ROLE_KEY=<Service-Role-Key>
```

Beide Werte stehen im Supabase-Dashboard unter **Project Settings → API**. Der Service-Role-Key ist geheim (volle DB-Rechte, keine RLS-Beschränkung) - `.env` ist per `.gitignore` vom Commit ausgeschlossen, das muss so bleiben.

Die übrigen Zeilen (`CROSSREF_MAILTO`, `OPENALEX_MAILTO`, `VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`) werden für `extract-doi`/`extract-fulltext`/`chunk` selbst nicht gebraucht (nur für andere Worker-Befehle) - können aber gleich mit ausgefüllt werden, schadet nicht.

### 4. OCR-Fallback für gescannte PDFs (Tesseract + Ghostscript)

Nur nötig, wenn PDFs dabei sind, die eingescannt statt digital erzeugt sind (kein durchsuchbarer Text). Ohne diese Installation schlägt nur der OCR-Fallback fehl, alles andere funktioniert weiterhin.

1. **Tesseract OCR** installieren:
   ```
   winget install --id UB-Mannheim.TesseractOCR
   ```
2. **Ghostscript** installieren: Installer von [github.com/ArtifexSoftware/ghostpdl-downloads/releases](https://github.com/ArtifexSoftware/ghostpdl-downloads/releases) herunterladen und ausführen.
3. **Deutsches Sprachpaket** einrichten: `deu.traineddata` aus [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) herunterladen. Zusammen mit den Ordnern `configs` und `tessconfigs` aus der Tesseract-Installation (liegen normalerweise unter `C:\Program Files\Tesseract-OCR\tessdata\`) nach `worker/.tessdata/` kopieren (Ordner ggf. neu anlegen).

   Grund für den Kopiervorgang: `Program Files` ist ohne Adminrechte nicht beschreibbar, `worker/.tessdata/` ist deshalb eine lokale Kopie (per `.gitignore` vom Commit ausgeschlossen).

## Fehlerbehebung

- **„.venv nicht gefunden"** → Schritt 2 oben durchführen.
- **„SUPABASE_URL muss in .env gesetzt sein"** (oder ähnlich) → Schritt 3 oben durchführen, `.env` liegt im Projekt-Hauptordner, nicht in `worker/`.
- **OCR-Fehler bei einer bestimmten Quelle** → Schritt 4 oben durchführen; betrifft nur gescannte PDFs, alle anderen Quellen werden trotzdem fertig verarbeitet.
