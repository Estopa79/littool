from supabase import Client, create_client

from .env import require_env


def load_config() -> tuple[str, str]:
    return require_env("SUPABASE_URL"), require_env("SUPABASE_SERVICE_ROLE_KEY")


def get_client() -> Client:
    url, key = load_config()
    return create_client(url, key)
