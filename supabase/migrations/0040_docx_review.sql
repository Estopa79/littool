-- Phase 6, Paket 1: Zitations-Pruefbericht fuer Word-Dokumente.
--
-- Verarbeitung laeuft als Worker-CLI-Befehl (`littool-worker docx-review`),
-- gleiches Architekturmuster wie die Schnell-Einschaetzung in Paket E
-- (Phase 5): rohe Datei-Bytes (.docx) sind bislang ausschliesslich Domaene
-- des Python-Workers, Edge Functions arbeiten in diesem Projekt nur auf
-- bereits extrahierten DB-Daten. Kein `jobs`-Eintrag noetig (das ist die
-- Infrastruktur fuer die Edge-Function-Hintergrundaktionen aus Phase 5,
-- Paket 1) - der Status lebt direkt an `docx_reviews.status`, gleiches
-- einfache Muster wie `sources.triage_recommendation` bei Paket E.

create table public.docx_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete set null,
  filename text not null,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  error text,
  summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index docx_reviews_created_at_idx on public.docx_reviews (created_at);

alter table public.docx_reviews enable row level security;
create policy "docx_reviews_authenticated_all"
  on public.docx_reviews for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.docx_reviews to authenticated;

-- Kein KI-Aufruf in diesem Feature (bewusst, s. Arbeitsplan-Notizen -
-- Zitations-/Seiten-/Verzeichnis-Abgleich ist deterministischer Code, kein
-- Vertrauen in Claude bei einem Pruefbericht, dessen Zweck Verlaesslichkeit
-- ist), daher kein neuer `ai_log_entries.action_type` noetig.
create table public.docx_review_findings (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.docx_reviews(id) on delete cascade,
  severity text not null check (severity in ('fehler', 'warnung', 'hinweis')),
  category text not null,
  doc_location text,
  context_snippet text,
  description text not null,
  suggestion text,
  source_id uuid references public.sources(id) on delete set null,
  created_at timestamptz not null default now()
);

create index docx_review_findings_review_idx on public.docx_review_findings (review_id);

alter table public.docx_review_findings enable row level security;
create policy "docx_review_findings_authenticated_all"
  on public.docx_review_findings for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.docx_review_findings to authenticated;

-- Privater Storage-Bucket fuer die hochgeladenen .docx-Dateien, gleiches
-- Policy-Muster wie der "pdfs"-Bucket (Migration 0002).
insert into storage.buckets (id, name, public)
values ('docx_reviews', 'docx_reviews', false)
on conflict (id) do nothing;

create policy "docx_reviews_bucket_authenticated_select"
  on storage.objects for select to authenticated using (bucket_id = 'docx_reviews');

create policy "docx_reviews_bucket_authenticated_insert"
  on storage.objects for insert to authenticated with check (bucket_id = 'docx_reviews');

create policy "docx_reviews_bucket_authenticated_update"
  on storage.objects for update to authenticated using (bucket_id = 'docx_reviews') with check (bucket_id = 'docx_reviews');

create policy "docx_reviews_bucket_authenticated_delete"
  on storage.objects for delete to authenticated using (bucket_id = 'docx_reviews');
