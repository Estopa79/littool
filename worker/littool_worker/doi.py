import re

import fitz  # PyMuPDF
from supabase import Client

from .supabase_client import download_pdf

DOI_PATTERN = re.compile(r"10\.\d{4,9}/[^\s\"'<>)\]]+", re.IGNORECASE)
_TRAILING_PUNCTUATION = ".,;:)]}>\"'"


def _clean(match: str) -> str:
    return match.rstrip(_TRAILING_PUNCTUATION)


def find_doi(text: str) -> str | None:
    match = DOI_PATTERN.search(text)
    if not match:
        return None
    return _clean(match.group(0))


def extract_doi_from_pdf(pdf_bytes: bytes) -> str | None:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        # 1) PDF-Metadaten (Info-Dictionary: Title, Subject, Keywords, ...)
        metadata_text = " ".join(str(v) for v in doc.metadata.values() if v)
        doi = find_doi(metadata_text)
        if doi:
            return doi

        # 2) Regex auf den ersten drei Seiten
        pages_text = [doc[i].get_text() for i in range(min(3, doc.page_count))]
        return find_doi("\n".join(pages_text))


def run_doi_extraction(client: Client) -> dict[str, int]:
    result = (
        client.table("sources")
        .select("id, storage_path")
        .eq("status", "processing")
        .is_("doi", "null")
        .execute()
    )
    rows = result.data or []

    stats = {"gefunden": 0, "needs_review": 0, "fehler": 0, "dubletten": 0}

    for row in rows:
        source_id = row["id"]
        storage_path = row.get("storage_path")

        if not storage_path:
            client.table("sources").update(
                {"status": "failed", "status_hint": "kein storage_path gesetzt"}
            ).eq("id", source_id).execute()
            stats["fehler"] += 1
            continue

        try:
            pdf_bytes = download_pdf(client, storage_path)
            doi = extract_doi_from_pdf(pdf_bytes)
        except Exception as exc:  # noqa: BLE001 - Ingest-Fehler müssen sichtbar bleiben, nicht abstürzen
            client.table("sources").update(
                {"status": "failed", "status_hint": f"DOI-Extraktion fehlgeschlagen: {exc}"}
            ).eq("id", source_id).execute()
            stats["fehler"] += 1
            continue

        if doi:
            existing = (
                client.table("sources")
                .select("id, title")
                .eq("doi", doi)
                .neq("id", source_id)
                .execute()
                .data
            )
            if existing:
                other = existing[0]
                client.table("sources").update(
                    {
                        "status": "needs_review",
                        "status_hint": (
                            f'Dublette: DOI {doi} bereits bei Quelle "{other["title"]}" vorhanden'
                        ),
                    }
                ).eq("id", source_id).execute()
                stats["dubletten"] += 1
                continue

            client.table("sources").update({"doi": doi}).eq("id", source_id).execute()
            stats["gefunden"] += 1
        else:
            client.table("sources").update(
                {"status": "needs_review", "status_hint": "keine DOI gefunden"}
            ).eq("id", source_id).execute()
            stats["needs_review"] += 1

    return stats
