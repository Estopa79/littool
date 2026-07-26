-- Phase 3, Paket 1: Schema Analyse-Entitaeten
--
-- research_questions/topics sind die Konfiguration aus Paket 2 (echte FFs und
-- Themenfelder traegt der Nutzer dort ein). source_topics ist reine
-- Mehrfach-Zuordnung (kein Relevanzwert - Themenfelder werden nur zugeordnet,
-- nicht bewertet). Die Relevanz-Bewertung haengt an der Forschungsfrage, nicht
-- am Themenfeld, deshalb eigene Tabelle source_rq_relevance pro Quelle-FF-Paar
-- (Grundlage der Matrix-Ansicht, Paket 8). Passagen werden erst ab Relevanz >= 1
-- extrahiert (Paket 4) - passages.relevance ist deshalb 1-3, waehrend
-- source_rq_relevance.relevance 0-3 sein kann (0 = keine Passagen zu erwarten).
--
-- ai_log_entries deckt in dieser Phase Quellen-/Passagen-bezogene KI-Aktionen ab
-- (Analyse, Uebersetzung, Passagen-Extraktion, Methodenprofil, Paraphrase).
-- section_id (Schreibwerkstatt, Phase 5) kommt per spaeterer Migration dazu -
-- genau wie schon bei sources/extraction_status (0008) wird nicht vorgebaut.

create table public.research_questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- Kuerzel, z. B. "FF1"
  question text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_topics (
  source_id uuid not null references public.sources(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (source_id, topic_id)
);

create index source_topics_topic_idx on public.source_topics (topic_id);

create table public.source_rq_relevance (
  source_id uuid not null references public.sources(id) on delete cascade,
  research_question_id uuid not null references public.research_questions(id) on delete cascade,
  relevance integer not null check (relevance between 0 and 3),
  reasoning text, -- Ein-Satz-Begruendung der KI
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, research_question_id)
);

create index source_rq_relevance_rq_idx on public.source_rq_relevance (research_question_id);

create table public.passages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  research_question_id uuid not null references public.research_questions(id) on delete cascade,
  page integer not null, -- ohne Seite kein Speichern (CLAUDE.md)
  original text not null,
  translation text,
  paraphrase text,
  relevance integer not null check (relevance between 1 and 3),
  citation text not null, -- fertige Zitation, z. B. "(Autor, Jahr, S. x)"
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index passages_source_idx on public.passages (source_id);
create index passages_rq_idx on public.passages (research_question_id);

create table public.ai_log_entries (
  id uuid primary key default gen_random_uuid(),
  action_type text not null
    check (action_type in ('analyse', 'uebersetzung', 'passagen_extraktion', 'methodenprofil', 'paraphrase')),
  source_id uuid references public.sources(id) on delete set null,
  passage_id uuid references public.passages(id) on delete set null,
  description text not null, -- Kurzbeschreibung, z. B. "3 Themenfelder + Relevanz je FF zugeordnet"
  tokens integer not null default 0,
  created_at timestamptz not null default now(),
  check (source_id is not null or passage_id is not null)
);

create index ai_log_entries_created_at_idx on public.ai_log_entries (created_at);
create index ai_log_entries_source_idx on public.ai_log_entries (source_id);

-- RLS + Grant fuer jede neue Tabelle (siehe 0001: Policy allein reicht nicht,
-- explizites GRANT an authenticated ist zusaetzlich noetig).

alter table public.research_questions enable row level security;
create policy "research_questions_authenticated_all"
  on public.research_questions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.research_questions to authenticated;

alter table public.topics enable row level security;
create policy "topics_authenticated_all"
  on public.topics for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.topics to authenticated;

alter table public.source_topics enable row level security;
create policy "source_topics_authenticated_all"
  on public.source_topics for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.source_topics to authenticated;

alter table public.source_rq_relevance enable row level security;
create policy "source_rq_relevance_authenticated_all"
  on public.source_rq_relevance for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.source_rq_relevance to authenticated;

alter table public.passages enable row level security;
create policy "passages_authenticated_all"
  on public.passages for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.passages to authenticated;

alter table public.ai_log_entries enable row level security;
create policy "ai_log_entries_authenticated_all"
  on public.ai_log_entries for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.ai_log_entries to authenticated;
