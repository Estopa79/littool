import bisect
import re
import statistics

import fitz  # PyMuPDF
from supabase import Client

from .supabase_client import download_pdf

TARGET_CHARS = 1000
MAX_CHARS = 1200
OVERLAP_CHARS = 150
BOLD_FLAG = 1 << 4

_PARAGRAPH_BREAK = re.compile(r"\n\s*\n+")


def _clean_text(text: str) -> str:
    """Postgres' text-Typ akzeptiert kein NUL-Byte (\\x00) - manche PDFs mit
    kaputten/eingebetteten Fonts liefern es trotzdem über get_text()."""
    return text.replace("\x00", "")


def _detect_headings(page: fitz.Page) -> list[tuple[str, int]]:
    """Grobe Überschriften-Heuristik: Zeilen, die deutlich größer oder fett
    gegenüber dem Fließtext der Seite sind. 'Falls erkennbar' - kein Anspruch
    auf eine vollständige Kapitelstruktur, nur ein Kontexthinweis."""
    plain = _clean_text(page.get_text())
    d = page.get_text("dict")

    sizes = [
        span["size"]
        for block in d.get("blocks", [])
        for line in block.get("lines", [])
        for span in line.get("spans", [])
    ]
    if not sizes:
        return []
    median_size = statistics.median(sizes)

    headings: list[tuple[str, int]] = []
    for block in d.get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            line_text = _clean_text("".join(s["text"] for s in spans)).strip()
            if not line_text or len(line_text) > 100:
                continue
            avg_size = sum(s["size"] for s in spans) / len(spans)
            is_bold = any(int(s.get("flags", 0)) & BOLD_FLAG for s in spans)
            if avg_size > median_size * 1.15 or (is_bold and avg_size >= median_size):
                idx = plain.find(line_text)
                if idx >= 0:
                    headings.append((line_text, idx))
    return headings


def _build_document_text(pdf_bytes: bytes) -> tuple[str, list[int], list[tuple[int, str]]]:
    """Liefert (Volltext, Seiten-Startoffsets, sortierte (Offset, Überschrift)-Liste)."""
    full_text = ""
    page_starts: list[int] = []
    headings: list[tuple[int, str]] = []

    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page in doc:
            page_starts.append(len(full_text))
            for heading_text, local_offset in _detect_headings(page):
                headings.append((len(full_text) + local_offset, heading_text))
            full_text += _clean_text(page.get_text()) + "\n\n"

    headings.sort(key=lambda h: h[0])
    return full_text, page_starts, headings


def _page_for_offset(offset: int, page_starts: list[int]) -> int:
    """1-basierte Seitenzahl für einen Zeichen-Offset im Volltext."""
    idx = bisect.bisect_right(page_starts, offset) - 1
    return max(idx, 0) + 1


def _heading_before(offset: int, headings: list[tuple[int, str]]) -> str | None:
    result = None
    for h_offset, h_text in headings:
        if h_offset > offset:
            break
        result = h_text
    return result


def _split_paragraphs(text: str) -> list[tuple[str, int]]:
    """(Text, Startoffset) je Absatz, Leerabsätze übersprungen."""
    paragraphs = []
    start = 0
    for m in _PARAGRAPH_BREAK.finditer(text):
        para = text[start : m.start()]
        if para.strip():
            paragraphs.append((para, start))
        start = m.end()
    tail = text[start:]
    if tail.strip():
        paragraphs.append((tail, start))
    return paragraphs


def _split_long_paragraph(text: str, start_offset: int) -> list[tuple[int, str]]:
    """Zerlegt einen zu langen Absatz an Wortgrenzen in ~TARGET_CHARS-Stücke.
    Rückgabe in (Offset, Text)-Reihenfolge, passend zu raw_chunks."""
    words = text.split(" ")
    pieces: list[tuple[int, str]] = []
    piece = ""
    piece_start = start_offset
    cursor = start_offset
    for word in words:
        if piece and len(piece) + len(word) + 1 > TARGET_CHARS:
            pieces.append((piece_start, piece.strip()))
            piece_start = cursor
            piece = ""
        piece += word + " "
        cursor += len(word) + 1
    if piece.strip():
        pieces.append((piece_start, piece.strip()))
    return pieces


def chunk_document(pdf_bytes: bytes) -> list[dict]:
    """Chunkt ein PDF: ~800-1200 Zeichen, bevorzugt an Absatzgrenzen, mit
    Überlappung; jeder Chunk trägt Seite (der Chunk gehört zur Seite, auf der
    er beginnt) und - falls erkennbar - eine Überschrift als Kontextpräfix."""
    full_text, page_starts, headings = _build_document_text(pdf_bytes)
    paragraphs = _split_paragraphs(full_text)

    raw_chunks: list[tuple[int, str]] = []  # (start_offset, text) ohne Überlappung
    current_parts: list[str] = []
    current_start: int | None = None
    current_len = 0

    def flush() -> None:
        nonlocal current_parts, current_start, current_len
        if current_parts:
            raw_chunks.append((current_start, "\n\n".join(current_parts)))
        current_parts = []
        current_start = None
        current_len = 0

    for para_text, para_start in paragraphs:
        if len(para_text) > MAX_CHARS:
            flush()
            raw_chunks.extend(_split_long_paragraph(para_text, para_start))
            continue

        added_len = len(para_text) + (2 if current_parts else 0)
        if current_parts and current_len + added_len > MAX_CHARS:
            flush()

        if current_start is None:
            current_start = para_start
        current_parts.append(para_text.strip())
        current_len += added_len

    flush()

    chunks = []
    previous_text = ""
    for index, (start_offset, text) in enumerate(raw_chunks):
        if previous_text:
            overlap = previous_text[-OVERLAP_CHARS:]
            overlap = overlap[overlap.find(" ") + 1 :] if " " in overlap else overlap
            text_with_overlap = f"{overlap} {text}".strip()
        else:
            text_with_overlap = text

        heading = _heading_before(start_offset, headings)
        final_text = f"[{heading}] {text_with_overlap}" if heading else text_with_overlap

        chunks.append(
            {
                "chunk_index": index,
                "page": _page_for_offset(start_offset, page_starts),
                "text": final_text,
            }
        )
        previous_text = text

    return chunks


def run_chunking(client: Client, limit: int | None = None) -> dict[str, int]:
    eligible = (
        client.table("sources")
        .select("id, storage_path")
        .in_("extraction_status", ["extracted", "ocr_done"])
        .execute()
        .data
        or []
    )

    # Gezielte Existenzprüfung je Quelle statt eines Komplettabzugs von
    # chunks.source_id - PostgREST liefert Default-mäßig nur eine begrenzte
    # Zeilenzahl pro Anfrage zurück, bei mittlerweile mehreren tausend Chunks
    # wären sonst nicht alle bereits gechunkten Quellen erkannt worden.
    todo = []
    for row in eligible:
        has_chunk = (
            client.table("chunks").select("id").eq("source_id", row["id"]).limit(1).execute().data
        )
        if not has_chunk:
            todo.append(row)
    if limit:
        todo = todo[:limit]

    stats = {"quellen_gechunkt": 0, "chunks_erzeugt": 0, "fehler": 0}

    for row in todo:
        try:
            pdf_bytes = download_pdf(client, row["storage_path"])
            chunks = chunk_document(pdf_bytes)
            if not chunks:
                continue
            payload = [
                {
                    "source_id": row["id"],
                    "page": c["page"],
                    "chunk_index": c["chunk_index"],
                    "text": c["text"],
                }
                for c in chunks
            ]
            client.table("chunks").insert(payload).execute()
            stats["quellen_gechunkt"] += 1
            stats["chunks_erzeugt"] += len(chunks)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar machen, Job läuft weiter
            print(f"Chunking fehlgeschlagen für Quelle {row['id']}: {exc}")
            stats["fehler"] += 1

    return stats
