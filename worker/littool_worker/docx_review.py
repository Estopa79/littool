import io
import re
import uuid
from datetime import datetime, timezone

from docx import Document
from docx.oxml.ns import qn
from supabase import Client

# Muster fuer die vom Tool selbst erzeugten In-Text-Zitationen (DB-Funktion
# `format_citation`, Migration 0019): "(Autor[, Autor2 | et al.], Jahr[a-z],
# S. Seite[-Seite])". Deckt damit exakt das ab, was per Kopier-Button aus der
# Schreibwerkstatt in ein Word-Dokument gelangt - manuell abweichend
# formatierte Zitationen werden nicht erkannt (dokumentierte Grenze).
CITATION_RE = re.compile(r"\(([^()]+?),\s*(\d{4}[a-z]?|o\.\s?J\.),\s*S\.\s*(\d+)(?:\s*[-–]\s*\d+)?\)")

# Woertliches/uebersetztes Zitat unmittelbar vor der Zitation, gleiches Muster
# wie CitationCopyButtons.tsx erzeugt: „...." bzw. "...." direkt gefolgt von
# der Zitation.
QUOTE_BEFORE_RE = re.compile(r'[„“"]([^„“”"]{3,600})[“”"]\s*$')
TRANSLATION_MARKER = "Übersetzung durch den Verfasser"

LITERATURVERZEICHNIS_RE = re.compile(r"^\s*literaturverzeichnis\s*$", re.IGNORECASE)
REF_ENTRY_RE = re.compile(r"^(?P<authors>.+?)\s\((?P<year>\d{4}[a-z]?|o\.\s?J\.)\)\.")


def _paragraph_page_breaks(paragraph) -> int:
    """Best-Effort-Seitenzaehlung: manuelle Seitenumbrueche (`w:br
    type="page"`) UND Word's `w:lastRenderedPageBreak` (Cache vom letzten
    Speichern in Word, kann nach Bearbeitung leicht veraltet sein). Genauer
    ist ohne echte Word-Layout-Engine nicht moeglich - ausreichend als
    ungefaehre Fundstelle, nicht als exakte Seitenzahl gedacht."""
    count = 0
    for br in paragraph._p.iter(qn("w:br")):
        if br.get(qn("w:type")) == "page":
            count += 1
    count += len(list(paragraph._p.iter(qn("w:lastRenderedPageBreak"))))
    return count


def _extract_paragraphs(data: bytes) -> list[tuple[str, int]]:
    doc = Document(io.BytesIO(data))
    result: list[tuple[str, int]] = []
    page = 1
    for p in doc.paragraphs:
        page += _paragraph_page_breaks(p)
        result.append((p.text, page))
    return result


def _split_body_and_references(
    paragraphs: list[tuple[str, int]],
) -> tuple[list[tuple[str, int]], list[tuple[str, int]], bool]:
    body: list[tuple[str, int]] = []
    references: list[tuple[str, int]] = []
    in_references = False
    found_heading = False
    for text, page in paragraphs:
        if not in_references and LITERATURVERZEICHNIS_RE.match(text or ""):
            in_references = True
            found_heading = True
            continue
        if in_references:
            if text.strip():
                references.append((text, page))
        else:
            body.append((text, page))
    return body, references, found_heading


def _normalize(s: str) -> str:
    s = s.replace("­", "")
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


def _expected_author_str(authors: list[dict] | None) -> str:
    """Spiegelt die Autor-Formatierung von `format_citation` (SQL,
    Migration 0019) in Python - muss identisch bleiben, sonst matcht kein
    einziges Tool-generiertes Zitat mehr."""
    families = [a.get("family", "").strip() for a in (authors or []) if a.get("family", "").strip()]
    if not families:
        return "Unbekannt"
    if len(families) == 1:
        return families[0]
    if len(families) == 2:
        return f"{families[0]} & {families[1]}"
    return f"{families[0]} et al."


def _year_num(year_str: str) -> int | None:
    m = re.match(r"(\d{4})", year_str)
    return int(m.group(1)) if m else None


def _context_snippet(text: str, start: int, end: int) -> str:
    lo = max(0, start - 60)
    hi = min(len(text), end + 20)
    return text[lo:hi].strip()


def _quote(s: str) -> str:
    """Deutsche typographische Anfuehrung fuer Meldungstexte - gleiche
    Konvention wie CitationCopyButtons.tsx (öffnend „, schliessend ASCII \")."""
    return f'„{s}"'


def run_docx_review(client: Client, review_id: str) -> dict:
    """Zitations-Pruefbericht (Phase 6, Paket 1) - bewusst als Worker-Befehl
    (nicht Edge Function): braucht rohe .docx-Bytes, gleiches Architekturmuster
    wie die Schnell-Einschaetzung in Paket E (Phase 5). Deterministischer
    Abgleich (Regex + DB-Lookups), kein Claude-Aufruf - der Sinn eines
    Pruefberichts ist Verlaesslichkeit, keine geratene Einschaetzung."""
    review = client.table("docx_reviews").select("*").eq("id", review_id).single().execute().data
    if not review:
        raise RuntimeError(f"docx_reviews-Zeile {review_id} nicht gefunden")

    client.table("docx_reviews").update({"status": "running", "error": None}).eq("id", review_id).execute()

    try:
        data = client.storage.from_("docx_reviews").download(
            review["storage_path"], query_params={"cb": uuid.uuid4().hex}
        )
        findings, summary = _analyze(client, data)

        client.table("docx_review_findings").delete().eq("review_id", review_id).execute()
        if findings:
            for f in findings:
                f["review_id"] = review_id
            client.table("docx_review_findings").insert(findings).execute()

        client.table("docx_reviews").update(
            {
                "status": "done",
                "summary": summary,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", review_id).execute()
        return summary
    except Exception as exc:  # noqa: BLE001 - Fehler sichtbar an der Review-Zeile melden, nie verschlucken
        client.table("docx_reviews").update(
            {"status": "failed", "error": str(exc), "completed_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", review_id).execute()
        raise


def _analyze(client: Client, data: bytes) -> tuple[list[dict], dict]:
    paragraphs = _extract_paragraphs(data)
    body, references, has_ref_heading = _split_body_and_references(paragraphs)

    sources = (
        client.table("sources")
        .select("id, title, authors, year, page_offset")
        .neq("status", "triage")
        .execute()
        .data
        or []
    )
    by_author_str: dict[tuple[str, int | None], list[dict]] = {}
    by_first_author_year: dict[tuple[str, int | None], list[dict]] = {}
    for s in sources:
        key_exact = (_expected_author_str(s["authors"]).lower(), s["year"])
        by_author_str.setdefault(key_exact, []).append(s)
        families = [a.get("family", "").strip() for a in (s["authors"] or []) if a.get("family", "").strip()]
        if families:
            key_first = (families[0].lower(), s["year"])
            by_first_author_year.setdefault(key_first, []).append(s)

    findings: list[dict] = []
    matched_in_text: set[str] = set()
    matched_in_refs: set[str] = set()
    citation_count = 0

    chunk_cache: dict[str, dict] = {}
    passage_translations_cache: dict[str, list[str]] = {}

    def _chunk_info(source_id: str) -> dict:
        if source_id not in chunk_cache:
            rows = client.table("chunks").select("page, text").eq("source_id", source_id).execute().data or []
            if rows:
                pages = [r["page"] for r in rows]
                chunk_cache[source_id] = {
                    "min_page": min(pages),
                    "max_page": max(pages),
                    "text": _normalize(" ".join(r["text"] for r in rows)),
                }
            else:
                chunk_cache[source_id] = {"min_page": None, "max_page": None, "text": ""}
        return chunk_cache[source_id]

    def _translations(source_id: str) -> list[str]:
        if source_id not in passage_translations_cache:
            rows = (
                client.table("passages")
                .select("translation")
                .eq("source_id", source_id)
                .not_.is_("translation", "null")
                .execute()
                .data
                or []
            )
            passage_translations_cache[source_id] = [_normalize(r["translation"]) for r in rows]
        return passage_translations_cache[source_id]

    # --- In-Text-Zitationen -------------------------------------------------
    for text, page in body:
        for m in CITATION_RE.finditer(text):
            citation_count += 1
            author_str, year_str, page_str = m.group(1).strip(), m.group(2), m.group(3)
            location = f"ca. S. {page} (Word)"
            snippet = _context_snippet(text, m.start(), m.end())
            year_num = _year_num(year_str)
            candidates = by_author_str.get((author_str.lower(), year_num), [])

            if not candidates:
                findings.append(
                    {
                        "severity": "fehler",
                        "category": "quelle_nicht_im_bestand",
                        "doc_location": location,
                        "context_snippet": snippet,
                        "description": f"Zitation {_quote(f'{author_str}, {year_str}, S. {page_str}')} "
                        "verweist auf keine Quelle im Bestand.",
                        "suggestion": "Autor/Jahr auf Tippfehler pruefen oder Quelle im Tool erfassen.",
                    }
                )
                continue

            if len(candidates) > 1:
                findings.append(
                    {
                        "severity": "warnung",
                        "category": "autor_jahr_mehrdeutig",
                        "doc_location": location,
                        "context_snippet": snippet,
                        "description": f"{_quote(f'{author_str}, {year_str}')} passt auf mehrere Quellen im "
                        "Bestand - bekannte Grenze des Tools (In-Text-Zitationen tragen keine a/b-Suffixe).",
                        "suggestion": "Im Literaturverzeichnis pruefen, welche der mehreren Quellen gemeint ist.",
                    }
                )
                continue

            source = candidates[0]
            matched_in_text.add(source["id"])

            offset = source.get("page_offset") or 0
            info = _chunk_info(source["id"])
            cited_page = int(page_str)
            if info["min_page"] is not None:
                lo, hi = info["min_page"] + offset, info["max_page"] + offset
                if not (lo <= cited_page <= hi):
                    findings.append(
                        {
                            "severity": "fehler",
                            "category": "seite_unplausibel",
                            "doc_location": location,
                            "context_snippet": snippet,
                            "description": f"S. {cited_page} liegt ausserhalb des fuer "
                            f"{_quote(source['title'][:60])} bekannten Seitenbereichs (S. {lo}-{hi}).",
                            "suggestion": "Seitenzahl der Zitation pruefen.",
                            "source_id": source["id"],
                        }
                    )

            quote_match = QUOTE_BEFORE_RE.search(text[: m.start()])
            if quote_match:
                quote = quote_match.group(1)
                is_translation = TRANSLATION_MARKER in text[m.end() : m.end() + 60]
                normalized_quote = _normalize(quote)
                if is_translation:
                    if not any(normalized_quote in t or t in normalized_quote for t in _translations(source["id"])):
                        findings.append(
                            {
                                "severity": "warnung",
                                "category": "uebersetzung_nicht_nachweisbar",
                                "doc_location": location,
                                "context_snippet": snippet,
                                "description": "Als Uebersetzung gekennzeichnetes Zitat wurde in keiner "
                                "erfassten Passagen-Uebersetzung dieser Quelle wiedergefunden.",
                                "suggestion": "Pruefen, ob die Uebersetzung frei formuliert oder die Passage "
                                "nicht erfasst ist.",
                                "source_id": source["id"],
                            }
                        )
                else:
                    if normalized_quote not in info["text"]:
                        findings.append(
                            {
                                "severity": "fehler",
                                "category": "zitat_nicht_nachweisbar",
                                "doc_location": location,
                                "context_snippet": snippet,
                                "description": "Woertliches Zitat wurde im extrahierten Text dieser Quelle "
                                "nicht gefunden.",
                                "suggestion": "Zitat-Wortlaut gegen das Original pruefen (Tippfehler, "
                                "Bindestrich-Umbrueche).",
                                "source_id": source["id"],
                            }
                        )

    # --- Literaturverzeichnis ------------------------------------------------
    if not has_ref_heading:
        findings.append(
            {
                "severity": "hinweis",
                "category": "kein_literaturverzeichnis",
                "doc_location": None,
                "context_snippet": None,
                "description": f'Kein Abschnitt {_quote("Literaturverzeichnis")} gefunden - '
                "Verzeichnis-Abgleich uebersprungen.",
                "suggestion": f'Überschrift {_quote("Literaturverzeichnis")} als eigener Absatz sicherstellen.',
            }
        )
    else:
        for text, page in references:
            m = REF_ENTRY_RE.match(text.strip())
            if not m:
                findings.append(
                    {
                        "severity": "hinweis",
                        "category": "verzeichnis_eintrag_nicht_geparst",
                        "doc_location": f"ca. S. {page} (Word)",
                        "context_snippet": _context_snippet(text, 0, min(len(text), 80)),
                        "description": f'Eintrag im Literaturverzeichnis konnte nicht als {_quote("Autor (Jahr).")} '
                        "geparst werden.",
                        "suggestion": 'Formatierung des Eintrags pruefen (APA 7: "Nachname, V. (Jahr). ...").',
                    }
                )
                continue

            first_author = m.group("authors").split(",")[0].strip()
            ref_year_str = m.group("year")
            year_num = _year_num(ref_year_str)
            candidates = by_first_author_year.get((first_author.lower(), year_num), [])
            if not candidates:
                findings.append(
                    {
                        "severity": "hinweis",
                        "category": "verzeichnis_eintrag_nicht_zugeordnet",
                        "doc_location": f"ca. S. {page} (Word)",
                        "context_snippet": _context_snippet(text, 0, min(len(text), 80)),
                        "description": f"Eintrag {_quote(f'{first_author}, {ref_year_str}')} konnte keiner "
                        "Quelle im Bestand zugeordnet werden.",
                        "suggestion": "Pruefen, ob die Quelle im Tool erfasst ist.",
                    }
                )
                continue
            for c in candidates:
                matched_in_refs.add(c["id"])

    if has_ref_heading:
        for source_id in matched_in_text - matched_in_refs:
            source = next(s for s in sources if s["id"] == source_id)
            findings.append(
                {
                    "severity": "fehler",
                    "category": "im_text_nicht_im_verzeichnis",
                    "doc_location": None,
                    "context_snippet": None,
                    "description": f"{_quote(source['title'][:80])} wird im Text zitiert, fehlt aber im "
                    "Literaturverzeichnis.",
                    "suggestion": "Eintrag im Literaturverzeichnis ergaenzen.",
                    "source_id": source_id,
                }
            )
        for source_id in matched_in_refs - matched_in_text:
            source = next(s for s in sources if s["id"] == source_id)
            findings.append(
                {
                    "severity": "warnung",
                    "category": "im_verzeichnis_nicht_im_text",
                    "doc_location": None,
                    "context_snippet": None,
                    "description": f"{_quote(source['title'][:80])} steht im Literaturverzeichnis, wird im "
                    "Text aber nirgends zitiert.",
                    "suggestion": "Pruefen, ob der Eintrag noch gebraucht wird.",
                    "source_id": source_id,
                }
            )

    if citation_count == 0:
        findings.append(
            {
                "severity": "hinweis",
                "category": "keine_zitationen_gefunden",
                "doc_location": None,
                "context_snippet": None,
                "description": 'Keine Zitationen im erwarteten Format "(Autor, Jahr, S. x)" im Dokumenttext '
                "gefunden.",
                "suggestion": None,
            }
        )

    summary = {
        "zitate_gefunden": citation_count,
        "verzeichnis_eintraege": len(references),
        "fehler": sum(1 for f in findings if f["severity"] == "fehler"),
        "warnung": sum(1 for f in findings if f["severity"] == "warnung"),
        "hinweis": sum(1 for f in findings if f["severity"] == "hinweis"),
    }
    return findings, summary
