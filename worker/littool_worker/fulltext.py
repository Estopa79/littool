import glob
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz  # PyMuPDF
from supabase import Client

from .supabase_client import download_pdf

TESSDATA_DIR = Path(__file__).resolve().parent.parent / ".tessdata"
MIN_CHARS_PER_PAGE = 30
# Manche Behörden-/Altbestand-PDFs haben genug Zeichen, aber eine kaputte
# Font-Kodierung (Buchstaben werden auf falsche Codepoints gemappt) - dann
# hilft die reine Zeichenanzahl nicht. Anteil alphabetischer Zeichen als
# zweites Signal: viele Zeichen, aber kaum Buchstaben darunter = vermutlich
# unbrauchbar, auch wenn nicht "leer".
MIN_ALPHA_RATIO = 0.4

# Dritte Erkennungsstufe (Paket 9, Phase 2): manche PDFs mit kaputtem
# CID-Font-Mapping bestehen fast komplett aus echten Buchstaben, nur eben den
# falschen (Buchstaben-Verschiebungs-Chiffre à la "GLVNXWLHUHQ" statt
# "diskutieren") - fällt bei der Alphabet-Quote also nicht auf. Häufige
# Stoppwörter tauchen darin so gut wie nie auf, da jedes verschobene
# "der"/"und"/"the" zu einer anderen Zeichenfolge wird - zwei real betroffene
# Quellen im Bestand über diesen Weg gefunden, beide per Stichprobe entdeckt,
# nicht automatisch.
_STOPWORDS = frozenset(
    "der die das und ist von zu mit den im für auf sich nicht ein eine als "
    "auch the and of to in is for that with are on".split()
)
MIN_STOPWORD_RATIO = 0.03
_WORD_RE = re.compile(r"[a-zäöüß]+", re.IGNORECASE)

_PAGE_RANGE_RE = re.compile(r"^\s*(\d+)\s*[-–—]\s*(\d+)")


_MISMATCH_HINT = (
    "Seiten-Offset unsicher: PDF entspricht nicht dem Crossref-Seitenbereich "
    "(vermutlich Preprint/Repository-Exemplar statt Verlags-PDF) - bitte manuell prüfen"
)


def _compute_page_offset(pages_field: str | None, pages_text: list[str]) -> tuple[int, str | None]:
    """Leitet den Zitationsseiten-Offset aus dem Crossref-Seitenbereich (Paket
    K, Phase 3) ab. Zwei Validierungsstufen gegen Preprint-/Repository-
    Exemplare (z. B. ResearchGate), die oft eine eigene, vom Verlags-PDF
    abweichende Paginierung haben:
    1. Seitenzahl muss zum erwarteten Bereich passen.
    2. Nicht ausreichend: manche Preprints haben zufällig dieselbe Seitenzahl
       wie die Verlagsversion, nummerieren aber bei 1 statt beim Journal-
       Startwert. Deshalb zusätzlich prüfen, ob die erwartete Zitationsseite
       als eigenständige Zahl auf einer Stichproben-Seite tatsächlich
       aufgedruckt ist - sonst 0 + sichtbarer Hinweis statt einer
       unzuverlässigen Zahl (siehe Migration 0021)."""
    if not pages_field:
        return 0, None
    match = _PAGE_RANGE_RE.match(pages_field)
    if not match:
        return 0, (
            "Seiten-Offset nicht ableitbar (kein erkennbarer Seitenbereich in 'pages') "
            "- bitte manuell prüfen"
        )
    first, last = int(match.group(1)), int(match.group(2))
    if (last - first + 1) != len(pages_text):
        return 0, _MISMATCH_HINT

    sample_index = len(pages_text) // 2
    expected_number = first + sample_index
    if not re.search(rf"(?<!\d){expected_number}(?!\d)", pages_text[sample_index]):
        return 0, _MISMATCH_HINT

    return first - 1, None


def _ensure_ocr_env() -> None:
    """Tesseract/Ghostscript sind als Windows-Programme installiert; frisch
    installiert kennt die aktuelle Shell-Session den PATH dafür aber noch
    nicht. Explizit ergänzen statt auf einen Neustart zu warten. TESSDATA_PREFIX
    zeigt auf ein lokales Sprachpaket-Verzeichnis (deu+eng), weil das
    Standard-Tessdata-Verzeichnis unter "Program Files" ohne Adminrechte nicht
    beschreibbar ist."""
    extra_paths = [r"C:\Program Files\Tesseract-OCR"]
    extra_paths += glob.glob(r"C:\Program Files\gs\gs*\bin")
    os.environ["PATH"] = os.pathsep.join([os.environ.get("PATH", ""), *extra_paths])
    os.environ["TESSDATA_PREFIX"] = str(TESSDATA_DIR)


def extract_pages(pdf_bytes: bytes) -> list[str]:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return [doc[i].get_text() for i in range(doc.page_count)]


def needs_ocr(pages: list[str]) -> bool:
    if not pages:
        return True

    total_chars = 0
    alpha_chars = 0
    for p in pages:
        stripped = p.strip()
        total_chars += len(stripped)
        alpha_chars += sum(1 for ch in stripped if ch.isalpha())

    avg = total_chars / len(pages)
    if avg < MIN_CHARS_PER_PAGE:
        return True

    alpha_ratio = alpha_chars / total_chars if total_chars else 0
    if alpha_ratio < MIN_ALPHA_RATIO:
        return True

    words = _WORD_RE.findall(" ".join(pages).lower())
    if len(words) >= 20:
        stopword_ratio = sum(1 for w in words if w in _STOPWORDS) / len(words)
        if stopword_ratio < MIN_STOPWORD_RATIO:
            return True

    return False


def run_ocr(pdf_bytes: bytes) -> bytes:
    _ensure_ocr_env()
    with tempfile.TemporaryDirectory() as tmp:
        in_path = Path(tmp) / "in.pdf"
        out_path = Path(tmp) / "out.pdf"
        in_path.write_bytes(pdf_bytes)
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "ocrmypdf",
                "--force-ocr",  # verwirft eine ggf. vorhandene, aber kaputte Textebene
                "--language",
                "deu+eng",
                str(in_path),
                str(out_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ocrmypdf fehlgeschlagen: {result.stderr.strip()[-500:]}")
        return out_path.read_bytes()


def run_fulltext_extraction(client: Client, limit: int | None = None) -> dict[str, int]:
    query = (
        client.table("sources")
        .select("id, title, storage_path, pages")
        .is_("extraction_status", "null")
        .not_.is_("storage_path", "null")
    )
    if limit:
        query = query.limit(limit)
    rows = query.execute().data or []

    stats = {"extracted": 0, "ocr_done": 0, "fehler": 0}

    for row in rows:
        source_id = row["id"]
        storage_path = row["storage_path"]
        try:
            pdf_bytes = download_pdf(client, storage_path)
            pages = extract_pages(pdf_bytes)

            if needs_ocr(pages):
                ocr_bytes = run_ocr(pdf_bytes)
                client.storage.from_("pdfs").update(
                    storage_path, ocr_bytes, {"content-type": "application/pdf"}
                )
                pages = extract_pages(ocr_bytes)
                status = "ocr_done"
            else:
                status = "extracted"

            avg_chars = sum(len(p.strip()) for p in pages) / len(pages) if pages else 0
            page_offset, offset_hint = _compute_page_offset(row.get("pages"), pages)
            update = {
                "extraction_status": status,
                "extraction_hint": f"{len(pages)} Seiten, Ø {avg_chars:.0f} Zeichen/Seite",
                "page_offset": page_offset,
            }
            if offset_hint:
                update["status"] = "needs_review"
                update["status_hint"] = offset_hint
            client.table("sources").update(update).eq("id", source_id).execute()
            stats[status] += 1
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar machen, Job läuft weiter
            client.table("sources").update(
                {
                    "extraction_status": "extraction_failed",
                    "extraction_hint": f"Volltextextraktion fehlgeschlagen: {exc}",
                }
            ).eq("id", source_id).execute()
            stats["fehler"] += 1

    return stats
