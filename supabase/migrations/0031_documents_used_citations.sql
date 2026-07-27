-- Phase 4, Paket 1: Dokumente & Verwendungs-Tracking
--
-- `documents` bewusst in Minimalform (id, typ, titel, status) - keine
-- Gliederung/Sections, die kommen erst in Phase 5 per eigener Migration.
-- Die drei realen Dokumente (ISP, Expose, Dissertation) werden als Seed
-- angelegt, weil die App von Anfang an eine globale Dokument-Auswahl
-- braucht (Paket 2) - keine Testdaten, sondern die tatsaechlichen
-- Zieldokumente der Arbeit.
--
-- `used_citations` haengt das Haekchen an das Paar (passage_id,
-- document_id): eine Zeile = "in diesem Dokument verwendet". Ein Zitat kann
-- so in einem Dokument angehakt sein und in einem anderen nicht.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('isp', 'expose', 'dissertation')),
  title text not null,
  status text not null default 'active' check (status in ('active', 'submitted', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create policy "documents_authenticated_all"
  on public.documents for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.documents to authenticated;

insert into public.documents (type, title) values
  ('isp', 'ISP'),
  ('expose', 'Exposé'),
  ('dissertation', 'Dissertation');

create table public.used_citations (
  passage_id uuid not null references public.passages(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (passage_id, document_id)
);

create index used_citations_document_idx on public.used_citations (document_id);

alter table public.used_citations enable row level security;
create policy "used_citations_authenticated_all"
  on public.used_citations for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.used_citations to authenticated;
