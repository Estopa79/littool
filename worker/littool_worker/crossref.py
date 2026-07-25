import httpx

CROSSREF_BASE = "https://api.crossref.org/works"

# Crossref-Werktypen -> unser type-Enum (journal/konferenz/buch/grau).
# Unbekannte/nicht gelistete Typen bleiben None (kein Blocker für "complete",
# type ist bei der Vollständigkeitsprüfung nicht Pflicht).
TYPE_MAP = {
    "journal-article": "journal",
    "proceedings-article": "konferenz",
    "book": "buch",
    "book-chapter": "buch",
    "monograph": "buch",
    "reference-book": "buch",
}


def fetch_crossref_metadata(doi: str, mailto: str) -> dict | None:
    headers = {"User-Agent": f"LitTool/0.1 (mailto:{mailto})"}
    resp = httpx.get(f"{CROSSREF_BASE}/{doi}", headers=headers, timeout=20)
    if resp.status_code != 200:
        return None
    message = resp.json().get("message")
    if not message:
        return None
    return _parse_message(message)


def _parse_message(message: dict) -> dict:
    authors = []
    for author in message.get("author", []) or []:
        if "family" in author:
            authors.append({"family": author.get("family", ""), "given": author.get("given", "")})
        elif "name" in author:
            authors.append({"family": author["name"], "given": ""})

    titles = message.get("title") or []
    title = titles[0] if titles else None

    containers = message.get("container-title") or []
    venue = containers[0] if containers else None

    year = None
    for date_field in ("published-print", "published-online", "published", "issued"):
        parts = (message.get(date_field) or {}).get("date-parts")
        if parts and parts[0] and parts[0][0]:
            year = parts[0][0]
            break

    issn_list = message.get("ISSN") or []
    issn = issn_list[0] if issn_list else None

    return {
        "title": title,
        "authors": authors or None,
        "year": year,
        "venue": venue,
        "volume": message.get("volume"),
        "issue": message.get("issue"),
        "pages": message.get("page"),
        "issn": issn,
        "type": TYPE_MAP.get(message.get("type")),
    }
