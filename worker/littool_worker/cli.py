import argparse
import sys

from .doi import run_doi_extraction
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
        f"{stats['needs_review']} ohne DOI (needs_review), {stats['fehler']} Fehler."
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(prog="littool-worker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status", help="Supabase-Verbindung prüfen").set_defaults(func=cmd_status)
    subparsers.add_parser(
        "extract-doi", help="DOI aus wartenden Quellen (status=processing) extrahieren"
    ).set_defaults(func=cmd_extract_doi)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
