-- Phase 5, Paket 1: Schema fuer Gliederung, Entwuerfe, Diskussion + Job-Infra.
--
-- Abweichung vom Wortlaut des Arbeitsplans ("rq_ids", "topic_ids",
-- "verwendete zitat-ids" als Spalten): wie bei source_topics/
-- source_rq_relevance (Migration 0014) werden n:m-Beziehungen als eigene
-- Verknuepfungstabellen abgebildet, nicht als Array-Spalten - konsistent mit
-- dem Rest des Schemas, nicht stillschweigend anders, nur die technische
-- Umsetzung der im Plan beschriebenen Beziehung.
--
-- `jobs` ist die erste generische Infrastruktur fuer asynchrone Aktionen im
-- Tool (bisherige lange Aktionen wie Ingest/Analyse liefen bereits synchron
-- innerhalb einer Edge-Function-Anfrage, z. B. generate-citations). Entwurf
-- (Paket 5) und Debatte (Paket 7) sollen laut CLAUDE.md weiterlaufen, wenn
-- der Client (Handy) die Seite verlaesst - dafuer braucht es Status in der
-- DB statt eines In-Memory-Laufs waehrend der HTTP-Anfrage. `type` per Check
-- eingeschraenkt wie ueberall sonst im Schema (action_type, sources.type
-- usw.), inkl. 'dummy' als dauerhaftem Diagnose-Typ fuer genau das
-- Fertig-Kriterium dieses Pakets.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dummy', 'draft_generation', 'debate')),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);

alter table public.jobs enable row level security;
create policy "jobs_authenticated_all"
  on public.jobs for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.jobs to authenticated;

-- Gliederungsbaum: ein Baum pro Dokument (ISP/Expose/Dissertation), beliebig
-- verschachtelt ueber parent_id. `number` (z. B. "1.2.3") bewusst als freies
-- Textfeld statt aus der Baumposition berechnet - die reale Gliederung des
-- Autors kann eigene Nummerierungsstile haben (Anhaenge, roemische Ziffern);
-- nullable, weil Paket 2 (Schnellerfassung per eingeruecktem Text) Abschnitte
-- zunaechst ohne Nummer anlegen koennen soll. `sort_order` bestimmt die
-- Geschwister-Reihenfolge unabhaengig vom Nummer-Text.

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  parent_id uuid references public.sections(id) on delete cascade,
  number text,
  title text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sections_document_idx on public.sections (document_id);
create index sections_parent_idx on public.sections (parent_id);

alter table public.sections enable row level security;
create policy "sections_authenticated_all"
  on public.sections for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.sections to authenticated;

-- Verknuepfung Abschnitt <-> Forschungsfragen/Themenfelder (das "rq_ids"/
-- "topic_ids" aus dem Plan), gleiches Muster wie source_topics.

create table public.section_research_questions (
  section_id uuid not null references public.sections(id) on delete cascade,
  research_question_id uuid not null references public.research_questions(id) on delete cascade,
  primary key (section_id, research_question_id)
);

create index section_research_questions_rq_idx on public.section_research_questions (research_question_id);

alter table public.section_research_questions enable row level security;
create policy "section_research_questions_authenticated_all"
  on public.section_research_questions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.section_research_questions to authenticated;

create table public.section_topics (
  section_id uuid not null references public.sections(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  primary key (section_id, topic_id)
);

create index section_topics_topic_idx on public.section_topics (topic_id);

alter table public.section_topics enable row level security;
create policy "section_topics_authenticated_all"
  on public.section_topics for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.section_topics to authenticated;

-- Personas: Konfiguration der Agenten-Rollen (Seed der drei Standard-
-- Personas folgt in Paket 3, hier nur das Schema). `system_prompt` traegt
-- laut Plan die Belegpflicht ("keine inhaltliche Behauptung ohne Verweis
-- auf ein Zitat aus dem Pool") - das ist Redaktionsinhalt fuer Paket 3, hier
-- nur das Feld dafuer.

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  stance text,
  system_prompt text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personas enable row level security;
create policy "personas_authenticated_all"
  on public.personas for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.personas to authenticated;

-- Entwuerfe: eine Zeile pro Version. `created_by`/`persona_id` bilden
-- "erstellt_von: persona/autor" aus dem Plan explizit ab (gleiches
-- Diskriminator-Muster wie unten bei discussion_entries.author_type).
-- `persona_id` ON DELETE RESTRICT statt CASCADE/SET NULL: Personas werden
-- laut Paket 3 deaktiviert, nicht geloescht, sobald sie Inhalte erzeugt
-- haben - ein Loeschversuch soll fehlschlagen statt historische Entwuerfe
-- stillschweigend zu verwaisen. `job_id` verweist auf den Hintergrund-Job,
-- der den Entwurf erzeugt hat (Paket 5) - ON DELETE SET NULL, da Jobs reine
-- Infrastruktur sind und ihre Loeschung nie einen Entwurf mitreissen darf.

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  version integer not null,
  text text not null,
  created_by text not null check (created_by in ('persona', 'author')),
  persona_id uuid references public.personas(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'adopted')),
  created_at timestamptz not null default now(),
  unique (section_id, version),
  check (
    (created_by = 'persona' and persona_id is not null)
    or (created_by = 'author' and persona_id is null)
  )
);

create index drafts_section_idx on public.drafts (section_id);

alter table public.drafts enable row level security;
create policy "drafts_authenticated_all"
  on public.drafts for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.drafts to authenticated;

-- "verwendete zitat-ids" aus dem Plan: welche Pool-Zitate fuer diese
-- Entwurfsversion ausgewaehlt waren (Eingabe an Claude bzw. Bezugsmenge fuer
-- die Belegpruefung in Paket 5 - ob ein Marker im Text tatsaechlich auf eine
-- dieser Passagen zeigt, ist Funktionslogik von Paket 5, nicht Schema).

create table public.draft_passages (
  draft_id uuid not null references public.drafts(id) on delete cascade,
  passage_id uuid not null references public.passages(id) on delete cascade,
  primary key (draft_id, passage_id)
);

create index draft_passages_passage_idx on public.draft_passages (passage_id);

alter table public.draft_passages enable row level security;
create policy "draft_passages_authenticated_all"
  on public.draft_passages for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.draft_passages to authenticated;

-- Diskussionsfaden je Abschnitt, bezogen auf eine konkrete Entwurfsversion
-- (Paket 6: "Bezug auf Entwurf-Version"). author_type/persona_id gleiches
-- Diskriminator-Muster wie bei drafts.created_by/persona_id, ON DELETE
-- RESTRICT aus demselben Grund.

create table public.discussion_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  author_type text not null check (author_type in ('persona', 'user')),
  persona_id uuid references public.personas(id) on delete restrict,
  text text not null,
  created_at timestamptz not null default now(),
  check (
    (author_type = 'persona' and persona_id is not null)
    or (author_type = 'user' and persona_id is null)
  )
);

create index discussion_entries_section_idx on public.discussion_entries (section_id);
create index discussion_entries_draft_idx on public.discussion_entries (draft_id);

alter table public.discussion_entries enable row level security;
create policy "discussion_entries_authenticated_all"
  on public.discussion_entries for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.discussion_entries to authenticated;

-- Freier Chat ueber den Bestand (Paket 9, weit spaeter) - Schema schon hier
-- angelegt, da Paket 1 laut Plan die komplette Basisinfrastruktur der Phase
-- liefert. `filters`/`messages` als jsonb (gleiches Muster wie
-- sources.authors seit Migration 0003) statt eigener Tabellen fuer
-- Filterkriterien/Nachrichten - beides ist reine Anzeige-/Verlaufsdaten
-- ohne eigene referenzielle Integritaet, kein Grund fuer Normalisierung.

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references public.personas(id) on delete restrict,
  title text,
  filters jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;
create policy "chat_sessions_authenticated_all"
  on public.chat_sessions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.chat_sessions to authenticated;
