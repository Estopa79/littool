import uuid

from supabase import Client, create_client

from .env import require_env


def load_config() -> tuple[str, str]:
    return require_env("SUPABASE_URL"), require_env("SUPABASE_SERVICE_ROLE_KEY")


def get_client() -> Client:
    url, key = load_config()
    return create_client(url, key)


def download_pdf(client: Client, storage_path: str) -> bytes:
    """Wie client.storage.from_('pdfs').download(), aber mit Cache-Buster.

    Cloudflare (vor Supabase Storage) cacht Objekt-Antworten pro URL - nach
    einem Überschreiben derselben Datei (z. B. OCR ersetzt das Original)
    liefert ein einfacher download() teils noch die alte Version zurück,
    obwohl der Upload serverseitig längst durchgelaufen ist. Ein zufälliger
    Query-Parameter erzwingt bei jedem Aufruf einen frischen Cache-Miss.
    """
    return client.storage.from_("pdfs").download(
        storage_path, query_params={"cb": uuid.uuid4().hex}
    )
