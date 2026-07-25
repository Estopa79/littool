from difflib import SequenceMatcher

from supabase import Client

from .crossref import fetch_crossref_metadata
from .openalex import fetch_openalex_by_doi, search_openalex_by_title

REQUIRED_FIELDS = ("title", "authors", "year", "venue")
FIELD_LABELS = {"title": "Titel", "authors": "Autoren", "year": "Jahr", "venue": "Venue"}

# Titelsuche ist Volltextsuche, kein exaktes Matching - ohne Ähnlichkeitsprüfung
# landen gelegentlich Metadaten einer völlig anderen Publikation an der falschen
# Quelle (Belegbarkeit!). Schwelle bewusst moderat, weil unsere Ausgangstitel oft
# nur der Dateiname sind.
TITLE_SIMILARITY_THRESHOLD = 0.5


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.strip().lower(), b.strip().lower()).ratio()


def _is_complete(source: dict) -> bool:
    return all(source.get(field) for field in REQUIRED_FIELDS)


def _missing_fields_hint(source: dict) -> str:
    missing = [FIELD_LABELS[f] for f in REQUIRED_FIELDS if not source.get(f)]
    return "Metadaten unvollständig: " + ", ".join(missing) + " fehlt"


def _merge(update: dict, new_data: dict) -> None:
    """Füllt Lücken in `update`, überschreibt nie bereits gesetzte Werte."""
    for key, value in new_data.items():
        if value is None:
            continue
        if update.get(key) is None:
            update[key] = value


def _finish(update: dict, row: dict, stats: dict[str, int]) -> dict:
    merged = {**row, **update}
    if _is_complete(merged):
        update["status"] = "complete"
        update["status_hint"] = None
        stats["complete"] += 1
    else:
        update["status"] = "needs_review"
        update["status_hint"] = _missing_fields_hint(merged)
        stats["needs_review"] += 1
    return update


def run_metadata_enrichment(client: Client, crossref_mailto: str, openalex_mailto: str) -> dict[str, int]:
    stats = {"complete": 0, "needs_review": 0, "fehler": 0}

    # Primärpfad: DOI bekannt (aus Paket 4), wartet auf Anreicherung.
    primary = (
        client.table("sources")
        .select("*")
        .eq("status", "processing")
        .not_.is_("doi", "null")
        .execute()
        .data
        or []
    )
    for row in primary:
        _process_with_doi(client, row, crossref_mailto, openalex_mailto, stats)

    # Fallback: keine DOI gefunden (Paket 4) -> Titelsuche bei OpenAlex.
    fallback = (
        client.table("sources")
        .select("*")
        .eq("status", "needs_review")
        .eq("status_hint", "keine DOI gefunden")
        .execute()
        .data
        or []
    )
    for row in fallback:
        _process_fallback(client, row, openalex_mailto, stats)

    return stats


def _process_with_doi(client: Client, row: dict, crossref_mailto: str, openalex_mailto: str, stats: dict[str, int]) -> None:
    source_id = row["id"]
    doi = row["doi"]
    try:
        crossref_data = fetch_crossref_metadata(doi, crossref_mailto) or {}
        openalex_data = fetch_openalex_by_doi(doi, openalex_mailto) or {}
    except Exception as exc:  # noqa: BLE001 - Fehler sichtbar machen statt abzustürzen
        client.table("sources").update(
            {"status": "failed", "status_hint": f"Metadaten-Anreicherung fehlgeschlagen: {exc}"}
        ).eq("id", source_id).execute()
        stats["fehler"] += 1
        return

    update: dict = {}
    _merge(update, crossref_data)
    _merge(update, {"abstract": openalex_data.get("abstract"), "citation_count": openalex_data.get("citation_count")})
    _merge(update, {"venue": openalex_data.get("venue"), "issn": openalex_data.get("issn")})

    update = _finish(update, row, stats)
    client.table("sources").update(update).eq("id", source_id).execute()


def _process_fallback(client: Client, row: dict, openalex_mailto: str, stats: dict[str, int]) -> None:
    source_id = row["id"]
    try:
        openalex_data = search_openalex_by_title(row["title"], openalex_mailto)
    except Exception as exc:  # noqa: BLE001
        client.table("sources").update(
            {"status_hint": f"Metadaten-Anreicherung fehlgeschlagen: {exc}"}
        ).eq("id", source_id).execute()
        stats["fehler"] += 1
        return

    candidate_title = (openalex_data or {}).get("title")
    similarity = _title_similarity(row["title"], candidate_title) if candidate_title else 0.0

    if not openalex_data or similarity < TITLE_SIMILARITY_THRESHOLD:
        client.table("sources").update(
            {
                "status_hint": (
                    "keine DOI gefunden, Titelsuche ohne ausreichend sicheren Treffer "
                    "- manuell prüfen"
                    if candidate_title
                    else "keine DOI gefunden, auch keine Metadaten über Titelsuche gefunden"
                )
            }
        ).eq("id", source_id).execute()
        stats["needs_review"] += 1
        return

    update: dict = {}
    _merge(update, openalex_data)

    update = _finish(update, row, stats)
    client.table("sources").update(update).eq("id", source_id).execute()
