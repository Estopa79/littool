import httpx

OPENALEX_BASE = "https://api.openalex.org/works"


def fetch_openalex_by_doi(doi: str, mailto: str) -> dict | None:
    resp = httpx.get(f"{OPENALEX_BASE}/doi:{doi}", params={"mailto": mailto}, timeout=20)
    if resp.status_code != 200:
        return None
    return _parse_work(resp.json())


def search_openalex_by_title(title: str, mailto: str) -> dict | None:
    resp = httpx.get(
        OPENALEX_BASE, params={"search": title, "per_page": 1, "mailto": mailto}, timeout=20
    )
    if resp.status_code != 200:
        return None
    results = resp.json().get("results") or []
    if not results:
        return None
    return _parse_work(results[0])


def _reconstruct_abstract(inverted_index: dict | None) -> str | None:
    if not inverted_index:
        return None
    positions: dict[int, str] = {}
    for word, idxs in inverted_index.items():
        for i in idxs:
            positions[i] = word
    if not positions:
        return None
    return " ".join(positions[i] for i in sorted(positions))


def _parse_work(work: dict) -> dict:
    primary_location = work.get("primary_location") or {}
    source = primary_location.get("source") or {}

    doi = work.get("doi")
    if doi:
        doi = doi.removeprefix("https://doi.org/")

    authors = []
    for authorship in work.get("authorships", []) or []:
        name = (authorship.get("author") or {}).get("display_name")
        if not name:
            continue
        parts = name.rsplit(" ", 1)
        if len(parts) == 2:
            authors.append({"given": parts[0], "family": parts[1]})
        else:
            authors.append({"given": "", "family": name})

    issn = source.get("issn_l") or ((source.get("issn") or [None])[0])

    return {
        "doi": doi,
        "title": work.get("title") or work.get("display_name"),
        "authors": authors or None,
        "year": work.get("publication_year"),
        "venue": source.get("display_name"),
        "issn": issn,
        "abstract": _reconstruct_abstract(work.get("abstract_inverted_index")),
        "citation_count": work.get("cited_by_count"),
    }
