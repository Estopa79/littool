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


METHOD_STUDY_TYPES = {"qualitativ", "quantitativ", "mixed", "konzeptionell", "review", "nicht_anwendbar"}

METHOD_SYSTEM_PROMPT = """Du erstellst ein Methodenprofil einer wissenschaftlichen Quelle für eine \
Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen Sachversicherung.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor \
oder danach und ohne Markdown-Codeblock:

{"study_type": "<Typ>", "method": "<Methode oder null>", "data_basis": "<Datengrundlage/Sample oder null>", \
"analysis_method": "<Auswertungsverfahren oder null>", "page_hint": <Seitenzahl oder null>}

Regeln:
- "study_type": genau einer von "qualitativ", "quantitativ", "mixed", "konzeptionell", "review", \
"nicht_anwendbar".
- "nicht_anwendbar" NUR für graue Literatur ohne eigene empirische/konzeptionelle Studie (z. B. \
Markt-/Praxisberichte, Gesetzestexte, Verordnungen, Statistiken ohne Methodenteil) - in diesem \
Fall "method", "data_basis", "analysis_method" und "page_hint" jeweils null.
- "method": kurze Bezeichnung der Forschungsmethode (z. B. "Fallstudie", "Online-Survey", \
"Systematic Literature Review", "Design Science Research"), null wenn nicht bestimmbar.
- "data_basis": Datengrundlage/Sample knapp beschrieben (z. B. "15 Experteninterviews in der \
Versicherungsbranche", "n=245 Survey-Antworten"), null wenn nicht bestimmbar.
- "analysis_method": Auswertungsverfahren (z. B. "Thematische Analyse", "PLS-SEM", "Regression"), \
null wenn nicht bestimmbar.
- "page_hint": die Seitenzahl (nur die Zahl aus den "[S. x]"-Markierungen unten) der Textstelle, an \
der der Methodenteil beginnt/am deutlichsten erkennbar ist. Nur eine Zahl verwenden, die auch \
tatsächlich als "[S. x]"-Marke unten vorkommt - sonst null.
"""


def _fetch_method_profile_source_ids(client: Client) -> set[str]:
    return {r["source_id"] for r in client.table("method_profiles").select("source_id").execute().data or []}


def _build_method_prompt(source: dict, chunks: list[dict]) -> str:
    chunks_block = "\n\n".join(f"[S. {c['page']}] {c['text'][:MAX_CHUNK_CHARS]}" for c in chunks)
    return (
        f"Quelle: {source['title']} ({source.get('year') or 'o. J.'})\n"
        f"Typ: {source.get('type') or 'unbekannt'}\n"
        f"Abstract: {source.get('abstract') or '(kein Abstract vorhanden)'}\n\n"
        f"Textauszüge aus der Quelle:\n{chunks_block or '(keine Textauszüge vorhanden)'}"
    )


def _parse_method_response(text: str, valid_pages: set[int]) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    data = json.loads(cleaned)

    study_type = data.get("study_type")
    if study_type not in METHOD_STUDY_TYPES:
        raise ValueError(f"unbekannter study_type in Antwort: {study_type!r}")

    page_hint = data.get("page_hint")
    if page_hint is not None and (not isinstance(page_hint, int) or page_hint not in valid_pages):
        page_hint = None  # nicht nachweisbare Seite lieber verwerfen als eine erfundene uebernehmen

    return {
        "study_type": study_type,
        "method": data.get("method") or None,
        "data_basis": data.get("data_basis") or None,
        "analysis_method": data.get("analysis_method") or None,
        "page_hint": page_hint,
    }


def run_method_profile_extraction(
    client: Client,
    api_key: str,
    limit: int | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    """Eigener Lauf fuer das Methodenprofil (Paket 5) - wie run_function_suggestion
    bewusst getrennt von der Themen-/Relevanz-Analyse, damit spaeteres Nachtragen
    nicht die bereits bezahlte Analyse anderer Quellen erneut anstoesst."""
    stats = {"profiliert": 0, "fehler": 0, "tokens_in": 0, "tokens_out": 0, "kosten_usd": 0.0}

    if source_ids:
        rows = (
            client.table("sources")
            .select("id, title, type, year, abstract")
            .in_("id", source_ids)
            .execute()
            .data
            or []
        )
    else:
        already_profiled = _fetch_method_profile_source_ids(client)
        all_rows = (
            client.table("sources").select("id, title, type, year, abstract").order("created_at").execute().data
            or []
        )
        rows = [r for r in all_rows if r["id"] not in already_profiled]
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
        valid_pages = {c["page"] for c in chunks}

        user_prompt = _build_method_prompt(row, chunks)
        call_stats: dict = {}
        try:
            response_text = claude_client.call(
                claude, user_prompt, system=METHOD_SYSTEM_PROMPT, max_tokens=500, stats=call_stats
            )
            profile = _parse_method_response(response_text, valid_pages)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar melden statt abzustuerzen
            print(f"{row['title'][:60]}: FEHLER - {exc}")
            stats["fehler"] += 1
            continue

        client.table("method_profiles").delete().eq("source_id", source_id).eq("confirmed", False).execute()
        client.table("method_profiles").insert({"source_id": source_id, "confirmed": False, **profile}).execute()

        tokens_total = call_stats.get("tokens_in", 0) + call_stats.get("tokens_out", 0)
        client.table("ai_log_entries").insert(
            {
                "action_type": "methodenprofil",
                "source_id": source_id,
                "description": f"Methodenprofil erstellt: {profile['study_type']}",
                "tokens": tokens_total,
            }
        ).execute()

        stats["profiliert"] += 1
        stats["tokens_in"] += call_stats.get("tokens_in", 0)
        stats["tokens_out"] += call_stats.get("tokens_out", 0)
        stats["kosten_usd"] = round(stats["kosten_usd"] + call_stats.get("kosten_usd", 0.0), 4)
        print(f"{row['title'][:60]}: {profile['study_type']} / {profile['method']}, {tokens_total} Tokens")

    return stats


CRITERIA_SYSTEM_PROMPT = """Du bewertest eine wissenschaftliche Quelle für die Evaluationsmatrix \
einer Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung. Du bekommst eine Liste von Kriterien und Textauszüge aus der Quelle.

Bewerte JEDES Kriterium mit einem Wert:
- 0 = nicht abgedeckt (die Quelle liefert dazu nichts)
- 1 = teilweise abgedeckt (die Quelle berührt das Kriterium am Rande oder unvollständig)
- 2 = voll abgedeckt (die Quelle behandelt das Kriterium substanziell)

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklärung davor \
oder danach und ohne Markdown-Codeblock:

{
  "evaluations": [
    {"short_name": "<Kurzname exakt wie vorgegeben>", "value": <0-2>, "reasoning": "<Ein-Satz-Begründung>"}
  ]
}

Regeln:
- Für JEDES vorgegebene Kriterium (per Kurzname) genau ein Eintrag, auch bei Wert 0.
- reasoning: ein knapper Satz auf Deutsch, der die Einschätzung nachvollziehbar begründet.
"""


def _fetch_criteria(client: Client, set_id: str | None) -> list[dict]:
    query = client.table("criteria").select("id, name, short_name, sort_order").order("sort_order")
    if set_id:
        query = query.eq("set_id", set_id)
    return query.execute().data or []


def _build_criteria_prompt(source: dict, chunks: list[dict], criteria: list[dict]) -> str:
    criteria_block = "\n".join(f'- "{c["short_name"]}": {c["name"]}' for c in criteria)
    chunks_block = "\n\n".join(f"[S. {c['page']}] {c['text'][:MAX_CHUNK_CHARS]}" for c in chunks)
    return (
        f"Kriterien:\n{criteria_block}\n\n"
        f"Quelle: {source['title']} ({source.get('year') or 'o. J.'})\n"
        f"Abstract: {source.get('abstract') or '(kein Abstract vorhanden)'}\n\n"
        f"Textauszüge aus der Quelle:\n{chunks_block or '(keine Textauszüge vorhanden)'}"
    )


def _parse_criteria_response(text: str, criteria_by_short_name: dict[str, dict]) -> list[dict]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    data = json.loads(cleaned)

    parsed = []
    for entry in data.get("evaluations", []):
        short_name = entry.get("short_name")
        value = entry.get("value")
        if short_name not in criteria_by_short_name:
            raise ValueError(f"unbekannter Kurzname in Antwort: {short_name!r}")
        if not isinstance(value, int) or value not in (0, 1, 2):
            raise ValueError(f"ungültiger Wert in Antwort: {entry!r}")
        parsed.append(
            {
                "criterion_id": criteria_by_short_name[short_name]["id"],
                "value": value,
                "reasoning": entry.get("reasoning") or None,
            }
        )
    return parsed


def run_criteria_preassessment(
    client: Client,
    api_key: str,
    set_id: str | None = None,
    limit: int | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    """KI-Vorbewertung je Quelle x Kriterium (Paket 11) - eigener Lauf, analog
    zu run_function_suggestion/run_method_profile_extraction. Quellen mit
    bereits vollstaendigem Bewertungssatz (z. B. die von Hand importierten
    aus der Evaluationsmatrix_Interaktiv.html) werden uebersprungen."""
    stats = {"bewertet": 0, "fehler": 0, "tokens_in": 0, "tokens_out": 0, "kosten_usd": 0.0}

    criteria = _fetch_criteria(client, set_id)
    if not criteria:
        raise RuntimeError("keine Kriterien gefunden - Migration 0025 ausgefuehrt und Set angelegt?")
    criteria_by_short_name = {c["short_name"]: c for c in criteria}
    criterion_ids = [c["id"] for c in criteria]

    if source_ids:
        rows = (
            client.table("sources")
            .select("id, title, year, abstract")
            .in_("id", source_ids)
            .execute()
            .data
            or []
        )
    else:
        existing_counts: dict[str, int] = {}
        for row in client.table("source_criteria").select("source_id, criterion_id").execute().data or []:
            if row["criterion_id"] in criterion_ids:
                existing_counts[row["source_id"]] = existing_counts.get(row["source_id"], 0) + 1
        already_complete = {sid for sid, count in existing_counts.items() if count >= len(criteria)}

        all_rows = client.table("sources").select("id, title, year, abstract").order("created_at").execute().data or []
        rows = [r for r in all_rows if r["id"] not in already_complete]
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

        user_prompt = _build_criteria_prompt(row, chunks, criteria)
        call_stats: dict = {}
        try:
            response_text = claude_client.call(
                claude, user_prompt, system=CRITERIA_SYSTEM_PROMPT, max_tokens=1500, stats=call_stats
            )
            evaluations = _parse_criteria_response(response_text, criteria_by_short_name)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar melden statt abzustuerzen
            print(f"{row['title'][:60]}: FEHLER - {exc}")
            stats["fehler"] += 1
            continue

        client.table("source_criteria").delete().eq("source_id", source_id).in_(
            "criterion_id", criterion_ids
        ).eq("confirmed", False).execute()
        for evaluation in evaluations:
            client.table("source_criteria").insert(
                {
                    "source_id": source_id,
                    "criterion_id": evaluation["criterion_id"],
                    "value": evaluation["value"],
                    "reasoning": evaluation["reasoning"],
                    "confirmed": False,
                }
            ).execute()

        tokens_total = call_stats.get("tokens_in", 0) + call_stats.get("tokens_out", 0)
        client.table("ai_log_entries").insert(
            {
                "action_type": "analyse",
                "source_id": source_id,
                "description": f"{len(evaluations)} Kriterien bewertet",
                "tokens": tokens_total,
            }
        ).execute()

        stats["bewertet"] += 1
        stats["tokens_in"] += call_stats.get("tokens_in", 0)
        stats["tokens_out"] += call_stats.get("tokens_out", 0)
        stats["kosten_usd"] = round(stats["kosten_usd"] + call_stats.get("kosten_usd", 0.0), 4)
        total_score = sum(e["value"] for e in evaluations)
        print(f"{row['title'][:60]}: Score {total_score}/{2 * len(criteria)}, {tokens_total} Tokens")

    return stats
