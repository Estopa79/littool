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

1. `frontend/.env` aus `frontend/.env.example` anlegen (Supabase-URL + Anon-Key).
2. Frontend: `cd frontend && npm install && npm run dev`
3. Worker: `cd worker && pip install -e .`
4. Supabase lokal: `npx supabase start` (im Repo-Root)
