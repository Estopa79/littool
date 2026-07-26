import json
import re

from supabase import Client

from . import claude_client

MAX_REPRESENTATIVE_CHUNKS = 8
MAX_CHUNK_CHARS = 900  # Chunks sind aus Phase 2 ohnehin ~1000-1200 Zeichen, nur Sicherheitsnetz

SYSTEM_PROMPT = """Du unterstützt bei einer Dissertation zum Thema Business-IT Alignment und \
digitale Transformation in der deutschen Sachversicherung. Du ordnest wissenschaftliche \
Quellen thematisch ein und bewertest ihre Relevanz für einzelne Forschungsfragen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung \
davor oder danach und ohne Markdown-Codeblock:

{
  "topics": ["<Themenfeld-Name>", ...],
  "relevance": [
    {"code": "<FF-Kürzel>", "relevance": <0-3>, "reasoning": "<Ein-Satz-Begründung>"},
    ...
  ]
}

Regeln:
- "topics": ausschließlich die Namen in Anführungszeichen aus der Liste "Verfügbare Themenfelder"
  (exakt wie dort notiert, OHNE den Doppelpunkt und OHNE die Beschreibung dahinter),
  mehrere erlaubt, leeres Array falls keins passt.
- "relevance": für JEDES vorgegebene Forschungsfragen-Kürzel genau ein Eintrag, auch bei Relevanz 0.
- relevance: 0 = nicht relevant, 1 = am Rande relevant, 2 = relevant, 3 = zentral relevant.
- reasoning: ein knapper Satz auf Deutsch, der die Einschätzung nachvollziehbar begründet.
"""


def _fetch_reference_data(client: Client) -> tuple[list[dict], list[dict]]:
    topics = client.table("topics").select("id, name, description").execute().data or []
    rqs = (
        client.table("research_questions")
        .select("id, code, question")
        .order("sort_order")
        .execute()
        .data
        or []
    )
    return topics, rqs


def _select_representative_chunks(client: Client, source_id: str) -> list[dict]:
    """Waehlt ueber den Chunk-Index gleichmaessig verteilte Chunks - eine
    einfache, aber fuers Ziel ('repraesentative' Auszuege) ausreichende
    Stichprobe, ohne den ganzen Volltext (teils >100 Seiten) zu verschicken."""
    rows = (
        client.table("chunks")
        .select("page, chunk_index, text")
        .eq("source_id", source_id)
        .order("chunk_index")
        .execute()
        .data
        or []
    )
    if len(rows) <= MAX_REPRESENTATIVE_CHUNKS:
        return rows

    step = (len(rows) - 1) / (MAX_REPRESENTATIVE_CHUNKS - 1)
    indices = sorted({round(i * step) for i in range(MAX_REPRESENTATIVE_CHUNKS)})
    return [rows[i] for i in indices]


def _format_authors(authors: list[dict] | None) -> str:
    if not authors:
        return "unbekannt"
    names = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in authors]
    return ", ".join(n for n in names if n) or "unbekannt"


def _build_user_prompt(source: dict, topics: list[dict], rqs: list[dict], chunks: list[dict]) -> str:
    topics_block = "\n".join(f'- "{t["name"]}" (Beschreibung: {t["description"] or "-"})' for t in topics)
    rqs_block = "\n".join(f"- {rq['code']}: {rq['question']}" for rq in rqs)
    chunks_block = "\n\n".join(f"[S. {c['page']}] {c['text'][:MAX_CHUNK_CHARS]}" for c in chunks)

    return (
        f"Verfügbare Themenfelder:\n{topics_block}\n\n"
        f"Forschungsfragen:\n{rqs_block}\n\n"
        f"Quelle:\n"
        f"Titel: {source['title']}\n"
        f"Autoren: {_format_authors(source.get('authors'))}\n"
        f"Jahr: {source.get('year') or 'unbekannt'}\n"
        f"Venue: {source.get('venue') or 'unbekannt'}\n"
        f"Abstract: {source.get('abstract') or '(kein Abstract vorhanden)'}\n\n"
        f"Textauszüge aus der Quelle:\n{chunks_block or '(keine Textauszüge vorhanden)'}"
    )


def _parse_response(
    text: str, topics_by_name: dict[str, dict], rq_by_code: dict[str, dict]
) -> tuple[list[str], list[dict]]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    data = json.loads(cleaned)

    topic_names = data.get("topics", [])
    unknown_topics = [t for t in topic_names if t not in topics_by_name]
    if unknown_topics:
        raise ValueError(f"unbekannte Themenfelder in Antwort: {unknown_topics}")

    seen_codes: set[str] = set()
    parsed_relevance = []
    for entry in data.get("relevance", []):
        code = entry.get("code")
        if code not in rq_by_code:
            raise ValueError(f"unbekanntes FF-Kürzel in Antwort: {code}")
        relevance = entry.get("relevance")
        if not isinstance(relevance, int) or not (0 <= relevance <= 3):
            raise ValueError(f"ungültige Relevanz für {code}: {relevance!r}")
        seen_codes.add(code)
        parsed_relevance.append(
            {
                "research_question_id": rq_by_code[code]["id"],
                "relevance": relevance,
                "reasoning": entry.get("reasoning"),
            }
        )

    missing = set(rq_by_code) - seen_codes
    if missing:
        raise ValueError(f"fehlende Forschungsfragen in Antwort: {sorted(missing)}")

    topic_ids = [topics_by_name[name]["id"] for name in topic_names]
    return topic_ids, parsed_relevance


def _save_results(
    client: Client,
    source_id: str,
    topic_ids: list[str],
    relevance_entries: list[dict],
    description: str,
    tokens: int,
) -> None:
    """Ersetzt nur unbestaetigte Zuordnungen. Bereits im QS-Workflow (Paket 6)
    bestaetigte Eintraege eines frueheren Laufs bleiben unangetastet, auch bei
    erneuter Analyse (z. B. Kalibrierungs-Wiederholung)."""
    confirmed_topics = {
        r["topic_id"]
        for r in client.table("source_topics")
        .select("topic_id")
        .eq("source_id", source_id)
        .eq("confirmed", True)
        .execute()
        .data
        or []
    }
    client.table("source_topics").delete().eq("source_id", source_id).eq("confirmed", False).execute()
    new_topic_rows = [
        {"source_id": source_id, "topic_id": tid, "confirmed": False}
        for tid in topic_ids
        if tid not in confirmed_topics
    ]
    if new_topic_rows:
        client.table("source_topics").insert(new_topic_rows).execute()

    confirmed_rqs = {
        r["research_question_id"]
        for r in client.table("source_rq_relevance")
        .select("research_question_id")
        .eq("source_id", source_id)
        .eq("confirmed", True)
        .execute()
        .data
        or []
    }
    client.table("source_rq_relevance").delete().eq("source_id", source_id).eq("confirmed", False).execute()
    new_relevance_rows = [
        {
            "source_id": source_id,
            "research_question_id": e["research_question_id"],
            "relevance": e["relevance"],
            "reasoning": e["reasoning"],
            "confirmed": False,
        }
        for e in relevance_entries
        if e["research_question_id"] not in confirmed_rqs
    ]
    if new_relevance_rows:
        client.table("source_rq_relevance").insert(new_relevance_rows).execute()

    client.table("ai_log_entries").insert(
        {"action_type": "analyse", "source_id": source_id, "description": description, "tokens": tokens}
    ).execute()


FUNCTION_SYSTEM_PROMPT = """Du ordnest eine wissenschaftliche Quelle für eine Dissertation zu \
Business-IT Alignment und digitale Transformation in der deutschen Sachversicherung ihrer \
Funktion in der Arbeit zu - unabhängig von der inhaltlichen Themenfeld-Zuordnung.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor \
oder danach und ohne Markdown-Codeblock:

{"function": "<Name>"}

Regeln:
- Nutze ausschließlich einen der unten aufgeführten Namen, exakt wie angegeben.
- "Themenfeld-Literatur" ist der Standardfall: die Quelle liefert inhaltliches Material zu \
einem der Themenfelder der Arbeit (das ist der Normalfall für die meisten wissenschaftlichen \
Quellen im Bestand).
- "Einleitung/Problemstellung" nur, wenn die Quelle primär zur Motivation/Problembeschreibung \
dient (z. B. Markt-/Branchenberichte, Statistiken ohne eigenen Theoriebezug).
- "Methodik" nur, wenn die Quelle primär Forschungsmethodik behandelt (z. B. \
Statistik-/Verfahrenslehrbücher), nicht inhaltlich zum eigentlichen Thema.
"""


def _fetch_functions(client: Client) -> list[dict]:
    return client.table("work_functions").select("id, name").execute().data or []


def _build_function_prompt(source: dict, chunks: list[dict], functions: list[dict]) -> str:
    functions_block = "\n".join(f'- "{f["name"]}"' for f in functions)
    chunks_block = "\n\n".join(f"[S. {c['page']}] {c['text'][:MAX_CHUNK_CHARS]}" for c in chunks)
    return (
        f"Verfügbare Funktionen:\n{functions_block}\n\n"
        f"Quelle:\n"
        f"Titel: {source['title']}\n"
        f"Autoren: {_format_authors(source.get('authors'))}\n"
        f"Jahr: {source.get('year') or 'unbekannt'}\n"
        f"Abstract: {source.get('abstract') or '(kein Abstract vorhanden)'}\n\n"
        f"Textauszüge aus der Quelle:\n{chunks_block or '(keine Textauszüge vorhanden)'}"
    )


def _parse_function_response(text: str, functions_by_name: dict[str, dict]) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    data = json.loads(cleaned)
    name = data.get("function")
    if name not in functions_by_name:
        raise ValueError(f"unbekannte Funktion in Antwort: {name!r}")
    return functions_by_name[name]["id"]


def run_function_suggestion(
    client: Client,
    api_key: str,
    limit: int | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    """Eigener, schlanker Lauf fuer die Funktion-Dimension (Paket F) - bewusst
    getrennt von run_topic_relevance_analysis, damit das Nachtragen der
    Funktion fuer die schon analysierten Quellen nicht die (bereits korrekte,
    bezahlte) Themen-/Relevanz-Analyse erneut anstoesst."""
    stats = {"zugeordnet": 0, "fehler": 0, "tokens_in": 0, "tokens_out": 0, "kosten_usd": 0.0}

    functions = _fetch_functions(client)
    if not functions:
        raise RuntimeError("work_functions ist leer - Migration 0023 ausgefuehrt?")
    functions_by_name = {f["name"]: f for f in functions}

    if source_ids:
        rows = (
            client.table("sources")
            .select("id, title, authors, year, abstract")
            .in_("id", source_ids)
            .execute()
            .data
            or []
        )
    else:
        already_tagged = {
            r["source_id"] for r in client.table("source_functions").select("source_id").execute().data or []
        }
        all_rows = (
            client.table("sources").select("id, title, authors, year, abstract").order("created_at").execute().data
            or []
        )
        rows = [r for r in all_rows if r["id"] not in already_tagged]
        if limit:
            rows = rows[:limit]

    claude = claude_client.get_client(api_key)

    for row in rows:
        source_id = row["id"]
        chunks = _select_representative_chunks(client, source_id)
        if not chunks:
            print(f"{row['title'][:60]}: keine Chunks, uebersprungen")
            stats["fehler"] += 1
            continue

        user_prompt = _build_function_prompt(row, chunks, functions)
        call_stats: dict = {}
        try:
            response_text = claude_client.call(
                claude, user_prompt, system=FUNCTION_SYSTEM_PROMPT, max_tokens=200, stats=call_stats
            )
            function_id = _parse_function_response(response_text, functions_by_name)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar melden statt abzustuerzen
            print(f"{row['title'][:60]}: FEHLER - {exc}")
            stats["fehler"] += 1
            continue

        client.table("source_functions").delete().eq("source_id", source_id).eq("confirmed", False).execute()
        client.table("source_functions").insert(
            {"source_id": source_id, "function_id": function_id, "confirmed": False}
        ).execute()

        function_name = next(f["name"] for f in functions if f["id"] == function_id)
        tokens_total = call_stats.get("tokens_in", 0) + call_stats.get("tokens_out", 0)
        client.table("ai_log_entries").insert(
            {
                "action_type": "analyse",
                "source_id": source_id,
                "description": f"Funktion vorgeschlagen: {function_name}",
                "tokens": tokens_total,
            }
        ).execute()

        stats["zugeordnet"] += 1
        stats["tokens_in"] += call_stats.get("tokens_in", 0)
        stats["tokens_out"] += call_stats.get("tokens_out", 0)
        stats["kosten_usd"] = round(stats["kosten_usd"] + call_stats.get("kosten_usd", 0.0), 4)
        print(f"{row['title'][:60]}: Funktion={function_name}, {tokens_total} Tokens")

    return stats


def run_topic_relevance_analysis(
    client: Client,
    api_key: str,
    limit: int | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    stats = {"analysiert": 0, "fehler": 0, "tokens_in": 0, "tokens_out": 0, "kosten_usd": 0.0}

    topics, rqs = _fetch_reference_data(client)
    if not topics or not rqs:
        raise RuntimeError("Themenfelder oder Forschungsfragen fehlen - erst Paket 2 abschliessen")
    topics_by_name = {t["name"]: t for t in topics}
    rq_by_code = {rq["code"]: rq for rq in rqs}

    if source_ids:
        rows = (
            client.table("sources")
            .select("id, title, authors, year, venue, abstract")
            .in_("id", source_ids)
            .execute()
            .data
            or []
        )
    else:
        query = (
            client.table("sources")
            .select("id, title, authors, year, venue, abstract")
            .is_("analysis_status", "null")
            .order("created_at")
        )
        if limit:
            query = query.limit(limit)
        rows = query.execute().data or []

    claude = claude_client.get_client(api_key)

    for row in rows:
        source_id = row["id"]
        chunks = _select_representative_chunks(client, source_id)
        if not chunks:
            client.table("sources").update(
                {"analysis_status": "failed", "analysis_hint": "keine Chunks vorhanden - Volltext/Chunking fehlt"}
            ).eq("id", source_id).execute()
            stats["fehler"] += 1
            print(f"{row['title'][:60]}: keine Chunks, uebersprungen")
            continue

        user_prompt = _build_user_prompt(row, topics, rqs, chunks)
        call_stats: dict = {}
        try:
            response_text = claude_client.call(
                claude, user_prompt, system=SYSTEM_PROMPT, max_tokens=1500, stats=call_stats
            )
            topic_ids, relevance_entries = _parse_response(response_text, topics_by_name, rq_by_code)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar an der Quelle speichern statt abzustuerzen
            client.table("sources").update(
                {"analysis_status": "failed", "analysis_hint": f"Analyse fehlgeschlagen: {exc}"}
            ).eq("id", source_id).execute()
            stats["fehler"] += 1
            print(f"{row['title'][:60]}: FEHLER - {exc}")
            continue

        topic_names_assigned = [t["name"] for t in topics if t["id"] in topic_ids]
        description = (
            f"{len(topic_ids)} Themenfeld(er) zugeordnet, "
            f"Relevanz für {len(relevance_entries)} Forschungsfragen bewertet"
        )
        tokens_total = call_stats.get("tokens_in", 0) + call_stats.get("tokens_out", 0)
        _save_results(client, source_id, topic_ids, relevance_entries, description, tokens_total)
        client.table("sources").update({"analysis_status": "complete", "analysis_hint": None}).eq(
            "id", source_id
        ).execute()

        stats["analysiert"] += 1
        stats["tokens_in"] += call_stats.get("tokens_in", 0)
        stats["tokens_out"] += call_stats.get("tokens_out", 0)
        stats["kosten_usd"] = round(stats["kosten_usd"] + call_stats.get("kosten_usd", 0.0), 4)
        relevant_for = [
            rq["code"] for rq in rqs if any(
                e["research_question_id"] == rq["id"] and e["relevance"] > 0 for e in relevance_entries
            )
        ]
        print(
            f"{row['title'][:60]}: Themen={topic_names_assigned}, relevant für={relevant_for}, "
            f"{call_stats.get('tokens_in', 0)}+{call_stats.get('tokens_out', 0)} Tokens"
        )

    return stats
