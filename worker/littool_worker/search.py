from supabase import Client

from .embeddings import _vec_literal, embed_query


def run_semantic_search(
    client: Client,
    api_key: str,
    query: str,
    filter_ranking_system: str | None = None,
    filter_type: str | None = None,
    match_limit: int = 20,
    match_threshold: float | None = None,
) -> list[dict]:
    """Bettet den Suchtext ein (Voyage, input_type="query") und ruft die
    pgvector-Ähnlichkeitssuche (Migration 0010) auf. Dient hier v. a. als
    Testwerkzeug für das Fertig-Kriterium aus Paket 6 - die eigentliche
    Anbindung ans Frontend (Paket 8) muss die Ähnlichkeitssuche serverseitig
    aufrufen, da der Voyage-Key nicht in den Browser darf."""
    embedding = embed_query(query, api_key)
    result = client.rpc(
        "search_semantic",
        {
            "query_embedding": _vec_literal(embedding),
            "filter_ranking_system": filter_ranking_system,
            "filter_type": filter_type,
            "match_limit": match_limit,
            "match_threshold": match_threshold,
        },
    ).execute()
    return result.data or []
