import anthropic

MODEL = "claude-sonnet-4-6"  # Entscheidung CLAUDE.md - Standardmodell fuer die KI-Phasen
MAX_RETRIES = 4

# USD pro 1 Million Tokens. Retries (Rate-Limits, 5xx) uebernimmt das SDK selbst
# (`max_retries`), hier nur Preise fuer die Kosten-Zaehlung.
PRICING_PER_MILLION_TOKENS_USD = {
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
}


def get_client(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key, max_retries=MAX_RETRIES)


def call(
    client: anthropic.Anthropic,
    prompt: str,
    system: str | None = None,
    model: str = MODEL,
    max_tokens: int = 1024,
    effort: str = "medium",
    stats: dict | None = None,
) -> str:
    """Einheitlicher Aufruf der Claude-API fuer alle Worker-Jobs.

    Wenn `stats` uebergeben wird, summiert der Aufruf Tokens/Kosten dort auf
    (gleiches Muster wie in `embeddings.run_embedding`: ein stats-dict pro Job-
    Lauf) - Grundlage fuer die spaeteren AiLogEntry-Eintraege (Paket 1).
    """
    try:
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system if system is not None else anthropic.NOT_GIVEN,
            output_config={"effort": effort},
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIStatusError as exc:
        raise RuntimeError(f"Claude-API-Fehler ({exc.status_code}): {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise RuntimeError(f"Claude-API nicht erreichbar: {exc}") from exc

    if response.stop_reason == "refusal":
        raise RuntimeError("Claude hat die Anfrage aus Sicherheitsgruenden abgelehnt (stop_reason=refusal)")

    text = next((block.text for block in response.content if block.type == "text"), "")

    if stats is not None:
        pricing = PRICING_PER_MILLION_TOKENS_USD.get(model, {"input": 0.0, "output": 0.0})
        stats["tokens_in"] = stats.get("tokens_in", 0) + response.usage.input_tokens
        stats["tokens_out"] = stats.get("tokens_out", 0) + response.usage.output_tokens
        stats["kosten_usd"] = round(
            stats.get("kosten_usd", 0.0)
            + response.usage.input_tokens / 1_000_000 * pricing["input"]
            + response.usage.output_tokens / 1_000_000 * pricing["output"],
            4,
        )

    return text
