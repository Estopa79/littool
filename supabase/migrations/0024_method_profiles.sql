-- Phase 3, Paket 5: Methodenprofil-Extraktion
--
-- Ein Profil pro Quelle (1:1, deshalb source_id direkt als Primary Key statt
-- eigener id-Spalte - anders als bei den n:m-Tabellen source_topics/
-- source_functions). Wie bei allen KI-Vorschlaegen: unbestaetigt bis der
-- Autor es bestaetigt (confirmed).

create table public.method_profiles (
  source_id uuid primary key references public.sources(id) on delete cascade,
  study_type text not null
    check (study_type in ('qualitativ', 'quantitativ', 'mixed', 'konzeptionell', 'review', 'nicht_anwendbar')),
  method text,
  data_basis text,
  analysis_method text,
  page_hint integer,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.method_profiles enable row level security;
create policy "method_profiles_authenticated_all"
  on public.method_profiles for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.method_profiles to authenticated;
