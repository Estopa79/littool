import json
import re

from supabase import Client

from . import claude_client
from .embeddings import _vec_literal, embed_query

MAX_CANDIDATE_CHUNKS = 6

SYSTEM_PROMPT = """Du extrahierst wörtliche Zitate aus wissenschaftlichen Quellen für eine \
Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung.

Du bekommst eine Forschungsfrage und Textauszüge aus einer Quelle. Extrahiere NUR Passagen, \
die WÖRTLICH (Zeichen für Zeichen, inkl. Zeichensetzung) in den unten stehenden Textauszügen \
vorkommen - erfinde nichts und paraphrasiere nicht. Auch wenn du die Originalarbeit aus deinem \
Trainingswissen kennst (z. B. bei bekannten Klassikern): zitiere AUSSCHLIESSLICH aus den unten \
gegebenen Auszügen, niemals aus dem Gedächtnis. Ein Zitat, das nicht Zeichen für Zeichen in den \
Auszügen unten steht, gehört nicht in die Antwort - auch wenn es inhaltlich plausibel klingt.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor \
oder danach und ohne Markdown-Codeblock:

{
  "passages": [
    {"original": "<wörtliches Zitat, exakt wie im Text>", "translation": "<deutsche Übersetzung>", "relevance": <1-3>}
  ]
}

Regeln:
- "original": muss wortwörtlich aus den Textauszügen stammen, ohne eigene Ergänzungen.
- Nutze NIEMALS Einträge aus einem Literaturverzeichnis/Referenzenliste als Zitat - das sind \
Verweise auf andere Werke, keine inhaltlichen Aussagen der Quelle selbst. Erkennbar an typischem \
Referenz-Format (Autor, Jahr, Titel, Journal/Verlag, Seitenzahlen einer anderen Publikation).
- Wenn nichts Zitierfähiges zur Forschungsfrage passt: "passages": [] (leeres Array).
- "translation": sinngemäße, flüssige deutsche Übersetzung des Zitats.
- relevance: 1 = am Rande relevant, 2 = relevant, 3 = zentral relevant für die Forschungsfrage.
- Maximal 4 Passagen, wähle die aussagekräftigsten aus.
- WICHTIG - gültiges JSON: Enthält "original" oder "translation" selbst ein Zitat in
  Anführungszeichen, escape JEDES gerade Anführungszeichen (") als \\" - auch wenn es Teil
  einer deutschen „…"-Konstruktion ist. Beispiel für korrektes Escaping:
  {"original": "he called it \\"aligning\\" rather than alignment", "translation": "er nannte es „aligning\\" statt Alignment", "relevance": 2}
  Verwende niemals ein einzelnes unescaped " innerhalb eines Textwerts.
"""


def _format_citation(client: Client, authors: list[dict] | None, year: int | None, page: int) -> str:
    """APA 7 mit Pflicht-Seitenzahl (CLAUDE.md). Formatierung liegt als
    einzige Quelle der Wahrheit in der DB (Migration 0019, Funktion
    format_citation) - ein Trigger dort haelt passages.citation automatisch
    synchron, wenn eine Quelle spaeter in der Bibliothek vervollstaendigt
    wird; eine zweite Python-Implementierung wuerde nur aus dem Takt geraten."""
    return client.rpc("format_citation", {"authors": authors, "p_year": year, "p_page": page}).execute().data


_LIGATURES = {
    "ﬀ": "ff",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
}


def _normalize(text: str) -> str:
    """Whitespace vereinheitlichen + Ligatur-Glyphen (ﬁ/ﬂ/ﬀ/...) auflösen -
    PyMuPDF liefert sie teils als eigene Unicode-Codepoints, Claude schreibt
    beim Zitieren aber oft die getrennten Buchstaben. Reine Darstellungsfrage,
    aendert den Zitatinhalt nicht - schwaecht die Verifikation nicht."""
    for ligature, expanded in _LIGATURES.items():
        text = text.replace(ligature, expanded)
    return re.sub(r"\s+", " ", text.strip())


def _find_source_chunk(original: str, chunks: list[dict]) -> dict | None:
    """Verifiziert, dass die extrahierte Passage tatsaechlich (bis auf
    Whitespace) im Chunk-Text vorkommt - verhindert erfundene Zitate."""
    normalized_original = _normalize(original)
    if not normalized_original:
        return None
    for chunk in chunks:
        if normalized_original in _normalize(chunk["text"]):
            return chunk
    return None


def _build_user_prompt(source: dict, rq: dict, chunks: list[dict]) -> str:
    chunks_block = "\n\n".join(f"[S. {c['page']}] {c['text']}" for c in chunks)
    return (
        f"Forschungsfrage {rq['code']}: {rq['question']}\n\n"
        f"Quelle: {source['title']} ({source.get('year') or 'o. J.'})\n\n"
        f"Textauszüge aus der Quelle:\n{chunks_block}"
    )


def _parse_response(text: str) -> list[dict]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    data = json.loads(cleaned)

    parsed = []
    for entry in data.get("passages", []):
        original = entry.get("original")
        translation = entry.get("translation")
        relevance = entry.get("relevance")
        if not isinstance(original, str) or not original.strip():
            raise ValueError(f"leeres/ungültiges 'original' in Antwort: {entry!r}")
        if not isinstance(translation, str) or not translation.strip():
            raise ValueError(f"leeres/ungültiges 'translation' in Antwort: {entry!r}")
        if not isinstance(relevance, int) or not (1 <= relevance <= 3):
            raise ValueError(f"ungültige Relevanz in Antwort: {entry!r}")
        parsed.append({"original": original, "translation": translation, "relevance": relevance})
    return parsed


def _fetch_eligible_pairs(client: Client, source_ids: list[str] | None) -> list[dict]:
    query = client.table("source_rq_relevance").select(
        "source_id, research_question_id, "
        "sources(title, authors, year, page_offset), "
        "research_questions(code, question)"
    ).gte("relevance", 1)
    if source_ids:
        query = query.in_("source_id", source_ids)
    else:
        query = query.is_("passage_extraction_status", "null")
    return query.execute().data or []


def run_passage_extraction(
    client: Client,
    anthropic_api_key: str,
    voyage_api_key: str,
    limit: int | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    stats = {
        "paare_verarbeitet": 0,
        "passagen_gespeichert": 0,
        "passagen_verworfen": 0,
        "fehler": 0,
        "tokens_in": 0,
        "tokens_out": 0,
        "kosten_usd": 0.0,
    }

    pairs = _fetch_eligible_pairs(client, source_ids)
    if limit:
        pairs = pairs[:limit]

    claude = claude_client.get_client(anthropic_api_key)
    rq_embedding_cache: dict[str, str] = {}

    for pair in pairs:
        source_id = pair["source_id"]
        rq_id = pair["research_question_id"]
        source = pair["sources"]
        rq = pair["research_questions"]
        label = f"{source['title'][:50]} × {rq['code']}"

        if rq_id not in rq_embedding_cache:
            rq_embedding_cache[rq_id] = _vec_literal(embed_query(rq["question"], voyage_api_key))

        chunks = (
            client.rpc(
                "search_chunks_within_source",
                {
                    "query_embedding": rq_embedding_cache[rq_id],
                    "filter_source_id": source_id,
                    "match_limit": MAX_CANDIDATE_CHUNKS,
                },
            )
            .execute()
            .data
            or []
        )
        if not chunks:
            client.table("source_rq_relevance").update(
                {"passage_extraction_status": "failed", "passage_extraction_hint": "keine Chunks mit Embedding gefunden"}
            ).eq("source_id", source_id).eq("research_question_id", rq_id).execute()
            stats["fehler"] += 1
            print(f"{label}: keine Chunks, uebersprungen")
            continue

        user_prompt = _build_user_prompt(source, rq, chunks)
        call_stats: dict = {}
        try:
            response_text = claude_client.call(
                claude, user_prompt, system=SYSTEM_PROMPT, max_tokens=2000, stats=call_stats
            )
            candidate_passages = _parse_response(response_text)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar speichern statt abzustuerzen
            client.table("source_rq_relevance").update(
                {"passage_extraction_status": "failed", "passage_extraction_hint": f"Extraktion fehlgeschlagen: {exc}"}
            ).eq("source_id", source_id).eq("research_question_id", rq_id).execute()
            stats["fehler"] += 1
            print(f"{label}: FEHLER - {exc}")
            continue

        # Nur unbestaetigte Passagen eines frueheren Laufs ersetzen (z. B. bei
        # Kalibrier-Wiederholung) - bereits bestaetigte bleiben unangetastet,
        # gleiches Prinzip wie bei source_topics/source_rq_relevance (Paket 3).
        client.table("passages").delete().eq("source_id", source_id).eq(
            "research_question_id", rq_id
        ).eq("confirmed", False).execute()

        kept = 0
        discarded = 0
        for candidate in candidate_passages:
            chunk = _find_source_chunk(candidate["original"], chunks)
            if chunk is None:
                discarded += 1
                print(f"{label}: Passage verworfen (nicht im Chunk-Text nachweisbar): {candidate['original'][:80]!r}")
                continue
            citation_page = chunk["page"] + (source.get("page_offset") or 0)
            citation = _format_citation(client, source.get("authors"), source.get("year"), citation_page)
            client.table("passages").insert(
                {
                    "source_id": source_id,
                    "research_question_id": rq_id,
                    "page": chunk["page"],
                    "original": candidate["original"],
                    "translation": candidate["translation"],
                    "relevance": candidate["relevance"],
                    "citation": citation,
                    "confirmed": False,
                }
            ).execute()
            kept += 1

        hint = None if kept > 0 else f"0 von {len(candidate_passages)} Kandidatenpassagen verifiziert"
        client.table("source_rq_relevance").update(
            {"passage_extraction_status": "complete", "passage_extraction_hint": hint}
        ).eq("source_id", source_id).eq("research_question_id", rq_id).execute()

        tokens_total = call_stats.get("tokens_in", 0) + call_stats.get("tokens_out", 0)
        client.table("ai_log_entries").insert(
            {
                "action_type": "passagen_extraktion",
                "source_id": source_id,
                "description": f"{rq['code']}: {kept} Passage(n) gespeichert, {discarded} verworfen",
                "tokens": tokens_total,
            }
        ).execute()

        stats["paare_verarbeitet"] += 1
        stats["passagen_gespeichert"] += kept
        stats["passagen_verworfen"] += discarded
        stats["tokens_in"] += call_stats.get("tokens_in", 0)
        stats["tokens_out"] += call_stats.get("tokens_out", 0)
        stats["kosten_usd"] = round(stats["kosten_usd"] + call_stats.get("kosten_usd", 0.0), 4)
        print(f"{label}: {kept} gespeichert, {discarded} verworfen, {tokens_total} Tokens")

    return stats
