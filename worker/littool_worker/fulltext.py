import glob
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz  # PyMuPDF
from supabase import Client

TESSDATA_DIR = Path(__file__).resolve().parent.parent / ".tessdata"
MIN_CHARS_PER_PAGE = 30


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
    avg = sum(len(p.strip()) for p in pages) / len(pages)
    return avg < MIN_CHARS_PER_PAGE


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
                "--skip-text",
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
        .select("id, title, storage_path")
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
            pdf_bytes = client.storage.from_("pdfs").download(storage_path)
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
            client.table("sources").update(
                {
                    "extraction_status": status,
                    "extraction_hint": f"{len(pages)} Seiten, Ø {avg_chars:.0f} Zeichen/Seite",
                }
            ).eq("id", source_id).execute()
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
