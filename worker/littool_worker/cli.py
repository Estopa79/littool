import argparse
import sys

from . import analysis
from .chunking import run_chunking
from . import claude_client
from .doi import run_doi_extraction
from . import passages as passages_module
from .duplicates import run_duplicate_detection
from .embeddings import run_embedding
from .enrich import run_metadata_enrichment
from .env import require_env
from .fulltext import run_fulltext_extraction
from .ranking import run_ranking_match
from .search import run_hybrid_search, run_semantic_search
from .supabase_client import get_client, load_config


def cmd_status(_args: argparse.Namespace) -> int:
    try:
        url, _key = load_config()
    except RuntimeError as exc:
        print(f"littool-worker: {exc}")
        return 1
    print(f"littool-worker bereit. SUPABASE_URL={url}")
    return 0


def cmd_extract_doi(_args: argparse.Namespace) -> int:
    client = get_client()
    stats = run_doi_extraction(client)
    print(
        f"DOI-Extraktion abgeschlossen: {stats['gefunden']} gefunden, "
        f"{stats['needs_review']} ohne DOI (needs_review), {stats['dubletten']} Dubletten, "
        f"{stats['fehler']} Fehler."
    )
    return 0


def cmd_enrich_metadata(_args: argparse.Namespace) -> int:
    client = get_client()
    crossref_mailto = require_env("CROSSREF_MAILTO")
    openalex_mailto = require_env("OPENALEX_MAILTO")
    stats = run_metadata_enrichment(client, crossref_mailto, openalex_mailto)
    print(
        f"Metadaten-Anreicherung abgeschlossen: {stats['complete']} complete, "
        f"{stats['needs_review']} needs_review, {stats['fehler']} Fehler."
    )
    return 0


def cmd_match_ranking(_args: argparse.Namespace) -> int:
    client = get_client()
    stats = run_ranking_match(client)
    print(
        f"Ranking-Matching abgeschlossen: {stats['gefunden']} gefunden, "
        f"{stats['kein_treffer']} kein Ranking gefunden."
    )
    return 0


def cmd_detect_duplicates(_args: argparse.Namespace) -> int:
    client = get_client()
    stats = run_duplicate_detection(client)
    print(
        f"Dublettenprüfung abgeschlossen: {stats['dubletten_markiert']} von "
        f"{stats['geprueft']} Quellen als mögliche Dublette markiert."
    )
    return 0


def cmd_extract_fulltext(args: argparse.Namespace) -> int:
    client = get_client()
    stats = run_fulltext_extraction(client, limit=args.limit)
    print(
        f"Volltextextraktion abgeschlossen: {stats['extracted']} extracted, "
        f"{stats['ocr_done']} ocr_done, {stats['fehler']} Fehler."
    )
    return 0


def cmd_chunk(args: argparse.Namespace) -> int:
    client = get_client()
    stats = run_chunking(client, limit=args.limit)
    print(
        f"Chunking abgeschlossen: {stats['quellen_gechunkt']} Quellen, "
        f"{stats['chunks_erzeugt']} Chunks erzeugt, {stats['fehler']} Fehler."
    )
    return 0


def cmd_embed(args: argparse.Namespace) -> int:
    client = get_client()
    api_key = require_env("VOYAGE_API_KEY")
    try:
        stats = run_embedding(client, api_key, batch_size=args.batch_size)
    except Exception as exc:  # noqa: BLE001 - Teilfortschritt ist bereits gespeichert
        print(f"Embedding abgebrochen: {exc}")
        print("Bereits eingebettete Chunks bleiben erhalten, ein erneuter Lauf setzt fort.")
        return 1
    print(
        f"Embedding abgeschlossen: {stats['eingebettet']} Chunks, {stats['tokens']:.0f} Tokens, "
        f"ca. ${stats['kosten_usd']:.4f}."
    )
    return 0


def cmd_search_semantic(args: argparse.Namespace) -> int:
    client = get_client()
    api_key = require_env("VOYAGE_API_KEY")
    results = run_semantic_search(
        client,
        api_key,
        args.query,
        filter_ranking_system=args.ranking,
        filter_type=args.type,
        match_limit=args.limit,
        match_threshold=args.threshold,
    )
    if not results:
        print("Keine Treffer.")
        return 0
    for r in results:
        print(f"[{r['rank']:.3f}] {r['title']} (S. {r['page']})")
        print(f"  {r['snippet'][:200]}")
    return 0


def cmd_search_hybrid(args: argparse.Namespace) -> int:
    client = get_client()
    api_key = require_env("VOYAGE_API_KEY")
    results = run_hybrid_search(
        client,
        api_key,
        args.query,
        search_mode=args.mode,
        filter_ranking_system=args.ranking,
        filter_type=args.type,
        match_limit=args.limit,
    )
    if not results:
        print("Keine Treffer.")
        return 0
    for r in results:
        print(f"[{r['rank']:.4f}] {r['title']} (S. {r['page']})")
        print(f"  {r['snippet'][:200]}")
    return 0


def cmd_analyze_topics(args: argparse.Namespace) -> int:
    client = get_client()
    api_key = require_env("ANTHROPIC_API_KEY")
    stats = analysis.run_topic_relevance_analysis(
        client, api_key, limit=args.limit, source_ids=args.source_id or None
    )
    print(
        f"Themen-/Relevanz-Analyse abgeschlossen: {stats['analysiert']} analysiert, "
        f"{stats['fehler']} Fehler, {stats['tokens_in']}+{stats['tokens_out']} Tokens, "
        f"ca. ${stats['kosten_usd']:.4f}."
    )
    return 0


def cmd_extract_passages(args: argparse.Namespace) -> int:
    client = get_client()
    anthropic_api_key = require_env("ANTHROPIC_API_KEY")
    voyage_api_key = require_env("VOYAGE_API_KEY")
    stats = passages_module.run_passage_extraction(
        client, anthropic_api_key, voyage_api_key, limit=args.limit, source_ids=args.source_id or None
    )
    print(
        f"Passagen-Extraktion abgeschlossen: {stats['paare_verarbeitet']} Quelle-FF-Paare, "
        f"{stats['passagen_gespeichert']} Passagen gespeichert, {stats['passagen_verworfen']} verworfen, "
        f"{stats['fehler']} Fehler, {stats['tokens_in']}+{stats['tokens_out']} Tokens, "
        f"ca. ${stats['kosten_usd']:.4f}."
    )
    return 0


def cmd_test_claude(_args: argparse.Namespace) -> int:
    api_key = require_env("ANTHROPIC_API_KEY")
    client = claude_client.get_client(api_key)
    stats: dict = {}
    try:
        text = claude_client.call(
            client,
            "Antworte in einem Satz auf Deutsch: Wozu dient ein Forschungsfragen-Raster "
            "in einer Dissertation?",
            stats=stats,
        )
    except RuntimeError as exc:
        print(f"Claude-Testaufruf fehlgeschlagen: {exc}")
        return 1
    print(f"Antwort: {text}")
    print(
        f"Tokens: {stats['tokens_in']} in / {stats['tokens_out']} out, "
        f"Kosten: ${stats['kosten_usd']:.4f}"
    )
    return 0


def main() -> None:
    # Windows-Konsole nutzt oft cp1252, das nicht jedes Unicode-Zeichen aus
    # Quellentiteln abbilden kann (z. B. U+2010 statt "-") - Ausgabe soll
    # deswegen nicht abstürzen.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(prog="littool-worker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status", help="Supabase-Verbindung prüfen").set_defaults(func=cmd_status)
    subparsers.add_parser(
        "extract-doi", help="DOI aus wartenden Quellen (status=processing) extrahieren"
    ).set_defaults(func=cmd_extract_doi)
    subparsers.add_parser(
        "enrich-metadata", help="Metadaten via Crossref/OpenAlex anreichern"
    ).set_defaults(func=cmd_enrich_metadata)
    subparsers.add_parser(
        "match-ranking", help="Ranking (VHB/SJR/CORE) per ISSN/Venue-Name matchen"
    ).set_defaults(func=cmd_match_ranking)
    subparsers.add_parser(
        "detect-duplicates", help="Ähnliche Titel über den ganzen Bestand markieren"
    ).set_defaults(func=cmd_detect_duplicates)

    extract_fulltext_parser = subparsers.add_parser(
        "extract-fulltext", help="Volltext seitenweise extrahieren, OCR-Fallback bei Bedarf"
    )
    extract_fulltext_parser.add_argument(
        "--limit", type=int, default=None, help="Nur die ersten N wartenden Quellen verarbeiten"
    )
    extract_fulltext_parser.set_defaults(func=cmd_extract_fulltext)

    chunk_parser = subparsers.add_parser(
        "chunk", help="Extrahierte Quellen in Chunks mit Seitenzuordnung zerlegen"
    )
    chunk_parser.add_argument(
        "--limit", type=int, default=None, help="Nur die ersten N wartenden Quellen verarbeiten"
    )
    chunk_parser.set_defaults(func=cmd_chunk)

    embed_parser = subparsers.add_parser(
        "embed", help="Chunks ohne Embedding via Voyage AI einbetten"
    )
    embed_parser.add_argument(
        "--batch-size", type=int, default=100, help="Chunks pro API-Aufruf (Default 100)"
    )
    embed_parser.set_defaults(func=cmd_embed)

    search_semantic_parser = subparsers.add_parser(
        "search-semantic", help="Semantische Suche testen (Query-Embedding + pgvector)"
    )
    search_semantic_parser.add_argument("query", help="Suchtext")
    search_semantic_parser.add_argument("--ranking", default=None, help="Filter Ranking-System")
    search_semantic_parser.add_argument("--type", default=None, help="Filter Quellentyp")
    search_semantic_parser.add_argument("--limit", type=int, default=20, help="Max. Treffer")
    search_semantic_parser.add_argument(
        "--threshold", type=float, default=None, help="Mindest-Ähnlichkeit (0-1)"
    )
    search_semantic_parser.set_defaults(func=cmd_search_semantic)

    search_hybrid_parser = subparsers.add_parser(
        "search-hybrid", help="Hybrid-Suche testen (RRF aus Volltext + semantisch)"
    )
    search_hybrid_parser.add_argument("query", help="Suchtext")
    search_hybrid_parser.add_argument(
        "--mode",
        choices=["hybrid", "fulltext", "semantic"],
        default="hybrid",
        help="Suchmodus (Default: hybrid)",
    )
    search_hybrid_parser.add_argument("--ranking", default=None, help="Filter Ranking-System")
    search_hybrid_parser.add_argument("--type", default=None, help="Filter Quellentyp")
    search_hybrid_parser.add_argument("--limit", type=int, default=20, help="Max. Treffer")
    search_hybrid_parser.set_defaults(func=cmd_search_hybrid)

    subparsers.add_parser(
        "test-claude", help="Test-Prompt ueber die Claude-API-Hilfsschicht, protokolliert Tokens/Kosten"
    ).set_defaults(func=cmd_test_claude)

    analyze_parser = subparsers.add_parser(
        "analyze-topics", help="Themenfelder zuordnen + Relevanz je Forschungsfrage bewerten (Claude)"
    )
    analyze_parser.add_argument(
        "--limit", type=int, default=None, help="Nur die ersten N noch nicht analysierten Quellen verarbeiten"
    )
    analyze_parser.add_argument(
        "--source-id",
        action="append",
        default=[],
        help="Gezielt eine Quelle analysieren (wiederholbar) - fuer die Kalibrierung an bekannten Quellen",
    )
    analyze_parser.set_defaults(func=cmd_analyze_topics)

    extract_passages_parser = subparsers.add_parser(
        "extract-passages", help="Woertliche Passagen je Quelle x relevanter Forschungsfrage extrahieren + uebersetzen"
    )
    extract_passages_parser.add_argument(
        "--limit", type=int, default=None, help="Nur die ersten N noch nicht bearbeiteten Quelle-FF-Paare verarbeiten"
    )
    extract_passages_parser.add_argument(
        "--source-id",
        action="append",
        default=[],
        help="Gezielt eine Quelle bearbeiten (wiederholbar, alle ihre relevanten FFs) - fuer die Kalibrierung",
    )
    extract_passages_parser.set_defaults(func=cmd_extract_passages)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
