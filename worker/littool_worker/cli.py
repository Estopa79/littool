import os
import sys

from dotenv import load_dotenv


def main() -> None:
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

    supabase_url = os.environ.get("SUPABASE_URL")
    if supabase_url:
        print(f"littool-worker bereit. SUPABASE_URL={supabase_url}")
    else:
        print("littool-worker bereit. SUPABASE_URL ist nicht gesetzt (.env prüfen).")
        sys.exit(1)


if __name__ == "__main__":
    main()
