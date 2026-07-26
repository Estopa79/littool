import time

import httpx
from supabase import Client

VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
MODEL = "voyage-3.5"
OUTPUT_DIMENSION = 1024  # Entscheidung aus Paket 1 (Phase 2, Schema Chunks)
BATCH_SIZE = 100
PRICE_PER_MILLION_TOKENS_USD = 0.06

# Ohne hinterlegte Zahlungsmethode erlaubt Voyage nur 3 Requests/Minute (Free
# Trial). 21s Abstand hält uns sicher darunter; zusätzlich Retry mit Backoff
# als Netz, falls trotzdem mal ein 429 kommt.
MIN_SECONDS_BETWEEN_REQUESTS = 21
MAX_RETRIES = 6
DEFAULT_RETRY_WAIT = 30

_last_request_at: float | None = None


def _pace() -> None:
    global _last_request_at
    if _last_request_at is not None:
        elapsed = time.monotonic() - _last_request_at
        remaining = MIN_SECONDS_BETWEEN_REQUESTS - elapsed
        if remaining > 0:
            time.sleep(remaining)
    _last_request_at = time.monotonic()


def embed_batch(
    texts: list[str], api_key: str, input_type: str = "document"
) -> tuple[list[list[float]], int]:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "input": texts,
        "model": MODEL,
        "input_type": input_type,
        "output_dimension": OUTPUT_DIMENSION,
    }

    for attempt in range(1, MAX_RETRIES + 1):
        _pace()
        resp = httpx.post(VOYAGE_API_URL, headers=headers, json=payload, timeout=60)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", DEFAULT_RETRY_WAIT))
            print(f"Rate-Limit erreicht, warte {wait}s (Versuch {attempt}/{MAX_RETRIES}) …")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        embeddings = [item["embedding"] for item in sorted(data["data"], key=lambda d: d["index"])]
        tokens = data.get("usage", {}).get("total_tokens", 0)
        return embeddings, tokens

    raise RuntimeError(f"Rate-Limit auch nach {MAX_RETRIES} Versuchen nicht überwunden")


def _vec_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in values) + "]"


def embed_query(query: str, api_key: str) -> list[float]:
    """Bettet einen einzelnen Suchtext ein. input_type="query" statt "document" -
    Voyage optimiert die beiden Modi unterschiedlich (asymmetrische Suche)."""
    embeddings, _tokens = embed_batch([query], api_key, input_type="query")
    return embeddings[0]


def run_embedding(client: Client, api_key: str, batch_size: int = BATCH_SIZE) -> dict[str, float]:
    """Bettet alle Chunks ohne embedding ein, batchweise. Wiederaufnahme bei
    Abbruch ergibt sich von selbst: jeder Lauf holt sich erneut nur Chunks mit
    embedding IS NULL, bereits eingebettete werden nie erneut angefasst."""
    stats = {"eingebettet": 0, "tokens": 0, "fehler": 0}

    while True:
        rows = (
            client.table("chunks")
            .select("id, text")
            .is_("embedding", "null")
            .limit(batch_size)
            .execute()
            .data
            or []
        )
        if not rows:
            break

        texts = [r["text"] for r in rows]
        embeddings, tokens = embed_batch(texts, api_key)

        for row, embedding in zip(rows, embeddings):
            client.table("chunks").update({"embedding": _vec_literal(embedding)}).eq(
                "id", row["id"]
            ).execute()

        stats["eingebettet"] += len(rows)
        stats["tokens"] += tokens
        print(f"{stats['eingebettet']} Chunks eingebettet, {stats['tokens']:.0f} Tokens bisher …")

    stats["kosten_usd"] = round(stats["tokens"] / 1_000_000 * PRICE_PER_MILLION_TOKENS_USD, 4)
    return stats
