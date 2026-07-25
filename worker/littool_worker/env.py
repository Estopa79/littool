import os
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
_loaded = False


def ensure_loaded() -> None:
    global _loaded
    if not _loaded:
        load_dotenv(ENV_PATH)
        _loaded = True


def require_env(name: str) -> str:
    ensure_loaded()
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} muss in .env gesetzt sein")
    return value
