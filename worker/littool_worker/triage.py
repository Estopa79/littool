import json
import re
from datetime import datetime, timezone

from supabase import Client

from . import claude_client
from .doi import find_doi
from .fulltext import extract_pages
from .supabase_client import download_pdf

MAX_PAGES_FOR_TRIAGE = 3
MAX_CHARS_FOR_TRIAGE = 6000  # genug fuer Abstract + Einleitung, ohne den ganzen Text zu verschicken

SYSTEM_PROMPT = """Du unterstuetzt bei der Eingangspruefung neuer Quellenkandidaten fuer eine \
Dissertation zu Business-IT Alignment und digitale Transformation in der deutschen \
Sachversicherung. Du bekommst Titel/Dateiname und die ersten Seiten (Abstract/Einleitung, \
sofern extrahierbar) eines Kandidaten sowie die Forschungsfragen der Arbeit und gibst eine \
Empfehlung, ob sich eine naehere Erfassung lohnt.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Erklaerung \
davor oder danach und ohne Markdown-Codeblock:

{
  "recommendation": "aufnehmen" | "grenzwertig" | "verwerfen",
  "overall_reasoning": "<Ein bis zwei Saetze auf Deutsch, die die Empfehlung begruenden>",
  "relevant_research_questions": [
    {"code": "<FF-Kuerzel>", "reasoning": "<knapper Satz, warum relevant>"}
  ]
}

Regeln:
- "recommendation": "aufnehmen" bei klar erkennbarem inhaltlichem Bezug zu mindestens einer \
Forschungsfrage, "verwerfen" bei erkennbar fehlendem Bezug (falsches Fachgebiet, rein \
populaerwissenschaftlich ohne wissenschaftlichen Mehrwert, o.ae.), "grenzwertig" wenn unklar \
oder nur am Rande relevant.
- "relevant_research_questions": NUR Forschungsfragen auflisten, zu denen der Kandidat \
tatsaechlich etwas beitraegt (nicht alle FFs wie bei der vollen Themen-/Relevanzanalyse) - \
ein leeres Array bei "verwerfen" ist normal.
- Wenn kein extrahierbarer Text vorliegt (nur Titel/Dateiname bekannt), das in \
"overall_reasoning" erwaehnen und die Einschaetzung entsprechend vorsichtig/unsicher \
formulieren.
"""


def _build_user_prompt(title: str, text_excerpt: str, rqs: list[dict]) -> str:
    rqs_block = "\n".join(f"- {rq['code']}: {rq['question']}" for rq in rqs)
    excerpt_block = text_excerpt.strip() or "(kein Text extrahierbar - vermutlich Scan ohne Textebene)"
    return (
        f"Forschungsfragen:\n{rqs_block}\n\n"
        f"Kandidat:\n"
        f"Titel/Dateiname: {title}\n\n"
        f"Textauszug (erste Seiten):\n{excerpt_block[:MAX_CHARS_FOR_TRIAGE]}"
    )


def _parse_response(text: str, rq_by_code: dict[str, dict]) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    data = json.loads(cleaned)

    recommendation = data.get("recommendation")
    if recommendation not in ("aufnehmen", "grenzwertig", "verwerfen"):
        raise ValueError(f"ungueltige recommendation in Antwort: {recommendation!r}")

    per_question = []
    for entry in data.get("relevant_research_questions", []):
        code = entry.get("code")
        if code not in rq_by_code:
            raise ValueError(f"unbekanntes FF-Kuerzel in Antwort: {code!r}")
        per_question.append(
            {
                "research_question_id": rq_by_code[code]["id"],
                "code": code,
                "reasoning": entry.get("reasoning") or "",
            }
        )

    return {
        "recommendation": recommendation,
        "overall_reasoning": data.get("overall_reasoning") or "",
        "per_question": per_question,
    }


def run_triage_assessment(
    client: Client,
    api_key: str,
    limit: int | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    """Schnell-Einschaetzung fuer Eingang-Kandidaten (Paket E) - bewusst als
    Worker-Befehl (nicht als Edge Function): braucht PDF-Rohtext, den bislang
    ausschliesslich PyMuPDF im Worker liefert, waehrend Edge Functions immer
    nur auf schon extrahierten DB-Daten (Chunks/Abstract) arbeiten. Laeuft
    manuell/im Hintergrund und verarbeitet auch mehrere wartende Kandidaten in
    einem Lauf (Stapel-Fall aus dem Plan)."""
    stats = {"eingeschaetzt": 0, "fehler": 0, "tokens_in": 0, "tokens_out": 0, "kosten_usd": 0.0}

    rqs = client.table("research_questions").select("id, code, question").order("sort_order").execute().data or []
    if not rqs:
        raise RuntimeError("keine Forschungsfragen angelegt")
    rq_by_code = {rq["code"]: rq for rq in rqs}

    if source_ids:
        rows = (
            client.table("sources")
            .select("id, title, storage_path")
            .eq("status", "triage")
            .in_("id", source_ids)
            .execute()
            .data
            or []
        )
    else:
        query = (
            client.table("sources")
            .select("id, title, storage_path")
            .eq("status", "triage")
            .is_("triage_recommendation", "null")
            .order("created_at")
        )
        if limit:
            query = query.limit(limit)
        rows = query.execute().data or []

    # DOI-Wiedererkennung gegen die Verworfen-Liste: anders als Hash/Titel
    # (clientseitig beim Upload geprueft, s. lib/triage.ts) ist die DOI erst
    # hier bekannt, da sie aus dem PDF-Text extrahiert wird - deshalb erst an
    # dieser Stelle nachgetragen, nicht blockierend (informativer Hinweis im
    # Frontend statt Upload-Abbruch, der zu diesem Zeitpunkt ohnehin zu spaet
    # kaeme).
    rejection_rows = (
        client.table("triage_rejections").select("id, doi").not_.is_("doi", "null").execute().data or []
    )
    rejection_by_doi = {r["doi"]: r["id"] for r in rejection_rows}

    claude = claude_client.get_client(api_key)

    for row in rows:
        source_id = row["id"]
        storage_path = row.get("storage_path")
        title = row["title"]

        text_excerpt = ""
        doi = None
        if storage_path:
            try:
                pdf_bytes = download_pdf(client, storage_path)
                pages = extract_pages(pdf_bytes)[:MAX_PAGES_FOR_TRIAGE]
                text_excerpt = "\n\n".join(pages)
                doi = find_doi(text_excerpt)
            except Exception as exc:  # noqa: BLE001 - Einschaetzung soll trotzdem versucht werden
                print(f"{title[:60]}: PDF-Text nicht lesbar ({exc}), Einschaetzung nur ueber Titel")

        user_prompt = _build_user_prompt(title, text_excerpt, rqs)
        call_stats: dict = {}
        try:
            response_text = claude_client.call(
                claude, user_prompt, system=SYSTEM_PROMPT, max_tokens=1000, stats=call_stats
            )
            parsed = _parse_response(response_text, rq_by_code)
        except Exception as exc:  # noqa: BLE001 - Fehler sichtbar melden statt abzustuerzen
            print(f"{title[:60]}: FEHLER - {exc}")
            stats["fehler"] += 1
            continue

        update: dict = {
            "triage_recommendation": parsed["recommendation"],
            "triage_reasoning": {
                "overall": parsed["overall_reasoning"],
                "per_question": parsed["per_question"],
            },
            "triage_assessed_at": datetime.now(timezone.utc).isoformat(),
        }
        if doi:
            # Kandidat kann zufaellig bereits (unter anderer source_id) im
            # echten Bestand liegen - `sources.doi` hat einen Unique-Index
            # (Migration 0003), ein blindes Schreiben wuerde die gesamte
            # Einschaetzung dieses Kandidaten mit einem harten DB-Fehler
            # abbrechen (live so aufgetreten: Testkandidat war ein bereits
            # ingestiertes Paper). Erst pruefen, sonst DOI weglassen statt
            # abzustuerzen - die Einschaetzung selbst ist trotzdem nuetzlich.
            existing = (
                client.table("sources").select("id").eq("doi", doi).neq("id", source_id).execute().data
            )
            if existing:
                print(f"{title[:60]}: DOI {doi} bereits bei anderer Quelle im Bestand - nicht uebernommen")
            else:
                update["doi"] = doi
                if doi in rejection_by_doi:
                    update["duplicate_of_rejection_id"] = rejection_by_doi[doi]

        client.table("sources").update(update).eq("id", source_id).execute()

        tokens_total = call_stats.get("tokens_in", 0) + call_stats.get("tokens_out", 0)
        client.table("ai_log_entries").insert(
            {
                "action_type": "triage",
                "source_id": source_id,
                "description": f"Eingangspruefung: Empfehlung '{parsed['recommendation']}'",
                "tokens": tokens_total,
            }
        ).execute()

        stats["eingeschaetzt"] += 1
        stats["tokens_in"] += call_stats.get("tokens_in", 0)
        stats["tokens_out"] += call_stats.get("tokens_out", 0)
        stats["kosten_usd"] = round(stats["kosten_usd"] + call_stats.get("kosten_usd", 0.0), 4)
        relevant_codes = [e["code"] for e in parsed["per_question"]]
        print(
            f"{title[:60]}: {parsed['recommendation']}, relevant fuer={relevant_codes}, "
            f"{tokens_total} Tokens"
        )

    return stats
