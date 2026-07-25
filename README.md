# LitTool

Persönliches Literatur- und Recherche-Tool für eine Doktorarbeit (Business-IT Alignment, deutsche Schaden-/Unfallversicherung).

Details zu Konzept, Architektur und Arbeitsweise: siehe [CLAUDE.md](./CLAUDE.md) und [docs/](./docs).

## Struktur

- `supabase/` – Migrationen und Edge Functions
- `frontend/` – React + Vite + TypeScript (PWA)
- `worker/` – Python-Worker für PDF-Verarbeitung, Anreicherung, Embeddings
- `data/rankings/` – Ranking-Listen (VHB, SJR)

## Setup

Siehe `docs/arbeitsplan-phase-1.md` für den aktuellen Stand.

1. `frontend/.env` aus `frontend/.env.example` anlegen (Supabase-URL + Anon-Key), `.env` im Repo-Root aus `.env.example` (Supabase-URL + Service-Role-Key für den Worker).
2. Frontend: `cd frontend && npm install && npm run dev`
3. Worker: `cd worker && python -m venv .venv && ./.venv/Scripts/pip install -e .`

### Migrationen anwenden

Es wird direkt gegen das Supabase-Cloud-Projekt entwickelt (kein lokaler Docker-Stack). Neue Dateien unter `supabase/migrations/` werden manuell im Supabase-Dashboard unter **SQL Editor** ausgeführt, in aufsteigender Reihenfolge der Nummerierung.
