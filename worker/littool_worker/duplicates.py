from difflib import SequenceMatcher

from supabase import Client

# Titel-Dubletten sind (anders als DOI) nicht per DB-Constraint verhindert -
# deshalb ein expliziter paarweiser Abgleich. Schwelle bewusst hoch (anders als
# der Fallback-Titel-Match in enrich.py mit 0.5), weil hier zwei echte Titel
# aus derselben Bibliothek verglichen werden, nicht ein Dateiname gegen einen
# Suchtreffer.
TITLE_SIMILARITY_THRESHOLD = 0.85


def _normalize(title: str) -> str:
    return " ".join(title.strip().lower().split())


def run_duplicate_detection(client: Client) -> dict[str, int]:
    rows = (
        client.table("sources")
        .select("id, title, created_at")
        .order("created_at")
        .execute()
        .data
        or []
    )

    flagged: set[str] = set()

    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            older, newer = rows[i], rows[j]
            if newer["id"] in flagged:
                continue
            ratio = SequenceMatcher(None, _normalize(older["title"]), _normalize(newer["title"])).ratio()
            if ratio < TITLE_SIMILARITY_THRESHOLD:
                continue
            client.table("sources").update(
                {
                    "status": "needs_review",
                    "status_hint": (
                        f'Ähnlicher Titel wie bestehende Quelle "{older["title"]}" '
                        f"(Ähnlichkeit {ratio:.0%}) - evtl. Dublette, bitte prüfen"
                    ),
                }
            ).eq("id", newer["id"]).execute()
            flagged.add(newer["id"])

    return {"dubletten_markiert": len(flagged), "geprueft": len(rows)}
