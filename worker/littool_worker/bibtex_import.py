import re
from difflib import SequenceMatcher

import bibtexparser
from bibtexparser.bparser import BibTexParser
from bibtexparser.customization import convert_to_unicode
from supabase import Client

from .enrich import FIELD_LABELS, REQUIRED_FIELDS

# Gleiche Schwelle wie duplicates.py: beide Seiten sind echte Bibliografie-
# Titel (nicht Dateiname-gegen-Suchtreffer wie in enrich.py mit 0.5).
TITLE_SIMILARITY_THRESHOLD = 0.85

TYPE_MAP = {
    "article": "journal",
    "inproceedings": "konferenz",
    "proceedings": "konferenz",
    "book": "buch",
    "incollection": "buch",
    "phdthesis": "buch",
    "mastersthesis": "buch",
    "techreport": "grau",
    "misc": "grau",
}


def _parse_authors(raw: str | None) -> list[dict] | None:
    """BibTeX-Autorenfeld ('Family, Given and Family2, Given2 and {Name}') in
    unser jsonb-Format [{family, given}]. Citavi umschliesst manche Namen mit
    geschweiften Klammern (Given-Family-Reihenfolge ohne Komma) - dann wird
    das letzte Wort als Nachname behandelt."""
    if not raw:
        return None
    authors = []
    for chunk in raw.split(" and "):
        chunk = chunk.strip().strip("{}").strip()
        if not chunk:
            continue
        if "," in chunk:
            family, given = chunk.split(",", 1)
            authors.append({"family": family.strip(), "given": given.strip()})
        else:
            parts = chunk.rsplit(" ", 1)
            if len(parts) == 2:
                authors.append({"family": parts[1].strip(), "given": parts[0].strip()})
            else:
                authors.append({"family": chunk, "given": ""})
    return authors or None


def _normalize_entry(entry: dict) -> dict:
    pages = entry.get("pages")
    if pages:
        pages = re.sub(r"-{2,}", "-", pages)  # BibTeX "159--179" -> "159-179"
    year_raw = (entry.get("year") or "").strip()
    return {
        "bibtex_id": entry.get("ID"),
        "type": TYPE_MAP.get(entry.get("ENTRYTYPE")),
        "title": entry.get("title") or None,
        "authors": _parse_authors(entry.get("author")),
        "year": int(year_raw) if year_raw.isdigit() else None,
        "venue": entry.get("journal") or entry.get("booktitle") or entry.get("school") or None,
        "volume": entry.get("volume") or None,
        "issue": entry.get("number") or None,
        "pages": pages,
        "issn": entry.get("issn") or None,
        "doi": entry.get("doi") or None,
        "abstract": entry.get("abstract") or None,
        "url": entry.get("url") or None,
    }


def parse_bibtex_file(path: str) -> list[dict]:
    parser = BibTexParser(common_strings=True)
    parser.customization = convert_to_unicode
    parser.ignore_nonstandard_types = False
    with open(path, encoding="utf-8-sig") as f:
        db = bibtexparser.load(f, parser=parser)
    return [_normalize_entry(e) for e in db.entries]


def _normalize_title(title: str | None) -> str:
    """Titel aus dem Bestand sind teils aus dem PDF-Dateinamen abgeleitet
    (Unterstriche/Bindestriche statt Leerzeichen) statt einer kuratierten
    BibTeX-Angabe - Trenner vereinheitlichen, sonst verpasst der reine
    SequenceMatcher-Vergleich offensichtliche Treffer."""
    normalized = re.sub(r"[-_–—]+", " ", (title or "").lower())
    return " ".join(normalized.split())


def match_entries(entries: list[dict], sources: list[dict]) -> dict:
    """Dreistufiges Matching (Paket B): 1) DOI exakt, 2) Titel-Ähnlichkeit +
    Jahr-Plausibilität, 3) Rest bleibt unmatched (manueller Zuordnungs-Dialog
    bzw. Neuanlage als Quelle ohne PDF)."""
    by_doi: dict[str, dict] = {}
    for s in sources:
        if s.get("doi"):
            by_doi[s["doi"].strip().lower()] = s

    matched_by_doi = []
    matched_by_title = []
    unmatched = []
    used_source_ids: set[str] = set()

    remaining = []
    for entry in entries:
        doi = (entry.get("doi") or "").strip().lower()
        if doi and doi in by_doi:
            source = by_doi[doi]
            matched_by_doi.append((entry, source))
            used_source_ids.add(source["id"])
        else:
            remaining.append(entry)

    for entry in remaining:
        entry_title = _normalize_title(entry.get("title"))
        if not entry_title:
            unmatched.append(entry)
            continue

        best_source = None
        best_ratio = 0.0
        for source in sources:
            if source["id"] in used_source_ids:
                continue
            ratio = SequenceMatcher(None, entry_title, _normalize_title(source["title"])).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_source = source

        if best_source is not None and best_ratio >= TITLE_SIMILARITY_THRESHOLD:
            year_ok = (
                entry.get("year") is None
                or best_source.get("year") is None
                or abs(entry["year"] - best_source["year"]) <= 1
            )
            if year_ok:
                matched_by_title.append((entry, best_source, best_ratio))
                used_source_ids.add(best_source["id"])
                continue

        unmatched.append(entry)

    return {"matched_by_doi": matched_by_doi, "matched_by_title": matched_by_title, "unmatched": unmatched}


def _build_fill_update(entry: dict, source: dict) -> tuple[dict, dict]:
    """BibTeX füllt nur leere Felder (Übernahme-Regel Paket B). Gibt (update,
    conflicts) zurück - conflicts sind Felder, wo Quelle UND Eintrag einen
    Wert haben, der voneinander abweicht (werden angezeigt, nie überschrieben)."""
    fillable = ("type", "authors", "year", "venue", "volume", "issue", "pages", "issn", "doi", "abstract", "url")
    update = {}
    conflicts = {}
    for field in fillable:
        entry_value = entry.get(field)
        if entry_value in (None, "", []):
            continue
        source_value = source.get(field)
        if source_value in (None, "", []):
            update[field] = entry_value
        elif source_value != entry_value:
            conflicts[field] = {"quelle": source_value, "bibtex": entry_value}
    return update, conflicts


def _is_complete(source: dict) -> bool:
    return all(source.get(field) for field in REQUIRED_FIELDS)


def apply_matches(client: Client, matches: dict) -> dict:
    stats = {"per_doi": 0, "per_titel": 0, "vollstaendig": 0, "konflikte": 0, "unmatched": len(matches["unmatched"])}

    for entry, source in matches["matched_by_doi"] + [(e, s) for e, s, _ in matches["matched_by_title"]]:
        update, conflicts = _build_fill_update(entry, source)
        if conflicts:
            stats["konflikte"] += 1
        if not update:
            continue
        merged = {**source, **update}
        if _is_complete(merged):
            update["status"] = "complete"
            update["status_hint"] = None
            stats["vollstaendig"] += 1
        client.table("sources").update(update).eq("id", source["id"]).execute()

    stats["per_doi"] = len(matches["matched_by_doi"])
    stats["per_titel"] = len(matches["matched_by_title"])
    return stats
