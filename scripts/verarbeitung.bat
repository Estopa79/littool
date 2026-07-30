@echo off
setlocal
cd /d "%~dp0..\worker"

echo ============================================
echo  LitTool: Lokale Verarbeitung neuer Quellen
echo ============================================
echo.

if not exist ".venv\Scripts\littool-worker.exe" (
    echo FEHLER: .venv nicht gefunden unter worker\.venv
    echo Siehe README.md, Abschnitt "Setup", zum Einrichten.
    echo.
    pause
    exit /b 1
)

echo [1/3] DOI-Extraktion...
".venv\Scripts\littool-worker.exe" extract-doi
if errorlevel 1 goto :fehler

echo.
echo [2/3] Volltext-Extraktion (OCR-Fallback bei Scans, kann dauern)...
".venv\Scripts\littool-worker.exe" extract-fulltext
if errorlevel 1 goto :fehler

echo.
echo [3/3] Chunking...
".venv\Scripts\littool-worker.exe" chunk
if errorlevel 1 goto :fehler

echo.
echo ============================================
echo  Fertig. Jetzt in der Bibliothek auf
echo  "Verarbeitung fortsetzen" klicken.
echo ============================================
echo.
pause
exit /b 0

:fehler
echo.
echo ============================================
echo  Ein Schritt ist fehlgeschlagen - Ausgabe oben pruefen.
echo ============================================
echo.
pause
exit /b 1
