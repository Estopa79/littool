import csv
import re
from pathlib import Path

from supabase import Client

RANKINGS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "rankings"


def normalize_issn(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"[^0-9Xx]", "", value).upper()
    return digits if len(digits) == 8 else None


def normalize_name(value: str | None) -> str | None:
    if not value:
        return None
    s = value.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


class RankingSource:
    """Eine Ranking-Liste (VHB, SJR, ggf. CORE) aus data/rankings/*.csv.

    Erwartet Spalten `issn` und `title`, plus eine Bewertungsspalte
    (`rating` bei VHB, `sjr_quartile` bei SJR).
    """

    def __init__(self, system: str, csv_path: Path):
        self.system = system
        self.by_issn: dict[str, str] = {}
        self.by_name: dict[str, str] = {}
        if not csv_path.exists():
            return
        with open(csv_path, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                rating = (row.get("rating") or row.get("sjr_quartile") or "").strip()
                if not rating:
                    continue
                issn = normalize_issn(row.get("issn"))
                if issn:
                    self.by_issn.setdefault(issn, rating)
                name = normalize_name(row.get("title"))
                if name:
                    self.by_name.setdefault(name, rating)

    def lookup(self, issn: str | None, venue: str | None) -> str | None:
        n_issn = normalize_issn(issn)
        if n_issn and n_issn in self.by_issn:
            return self.by_issn[n_issn]
        n_name = normalize_name(venue)
        if n_name and n_name in self.by_name:
            return self.by_name[n_name]
        return None


_sources: list[RankingSource] | None = None


def _load_sources() -> list[RankingSource]:
    global _sources
    if _sources is None:
        # Reihenfolge VHB -> SJR -> CORE (CORE-Liste noch nicht beschafft,
        # kann per weiterer RankingSource ergänzt werden, sobald verfügbar).
        _sources = [
            RankingSource("VHB", RANKINGS_DIR / "vhb.csv"),
            RankingSource("SJR", RANKINGS_DIR / "sjr.csv"),
        ]
    return _sources


def match_ranking(issn: str | None, venue: str | None) -> tuple[str | None, str | None]:
    """Liefert (ranking_system, ranking_value) oder (None, None) bei keinem Treffer.
    Kein Treffer ist kein Fehler - kommt schlicht als "kein Ranking gefunden" an."""
    for source in _load_sources():
        rating = source.lookup(issn, venue)
        if rating:
            return source.system, rating
    return None, None


def run_ranking_match(client: Client) -> dict[str, int]:
    stats = {"gefunden": 0, "kein_treffer": 0}

    rows = (
        client.table("sources")
        .select("id, issn, venue")
        .is_("ranking_system", "null")
        .neq("type", "grau")
        .execute()
        .data
        or []
    )

    for row in rows:
        system, value = match_ranking(row.get("issn"), row.get("venue"))
        client.table("sources").update(
            {"ranking_system": system, "ranking_value": value}
        ).eq("id", row["id"]).execute()
        stats["gefunden" if system else "kein_treffer"] += 1

    return stats
