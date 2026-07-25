import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def load_config() -> tuple[str, str]:
    load_dotenv(ENV_PATH)
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen in .env gesetzt sein")
    return url, key


def get_client() -> Client:
    url, key = load_config()
    return create_client(url, key)
