-- Phase 3, Paket 4 (Ergaenzung): zentrale Zitations-Formatierung + automatische
-- Korrektur bei spaeterer Metadaten-Vervollstaendigung
--
-- Fund bei der Kalibrierung: 86 von 150 analysierten Quellen fehlen Autoren
-- und/oder Jahr (der bekannte needs_review-Rueckstand aus Phase 1). Passagen
-- werden trotzdem jetzt schon extrahiert (Autor-Entscheidung) - damit eine
-- spaetere Korrektur der Quelle in der Bibliothek nicht dauerhaft
-- "(Unbekannt, o. J., ...)" stehen laesst, liegt die APA-Formatierung als
-- einzige Quelle der Wahrheit hier in der DB (statt dupliziert in Python),
-- ein Trigger haelt passages.citation danach automatisch synchron.

create or replace function public.format_citation(authors jsonb, p_year int, p_page int)
returns text
language plpgsql
immutable
as $$
declare
  families text[];
  author_str text;
  year_str text;
begin
  select array_agg(trim(elem->>'family')) filter (where trim(elem->>'family') <> '')
  into families
  from jsonb_array_elements(coalesce(authors, '[]'::jsonb)) elem;

  if families is null or array_length(families, 1) is null then
    author_str := 'Unbekannt';
  elsif array_length(families, 1) = 1 then
    author_str := families[1];
  elsif array_length(families, 1) = 2 then
    author_str := families[1] || ' & ' || families[2];
  else
    author_str := families[1] || ' et al.';
  end if;

  year_str := coalesce(p_year::text, 'o. J.');

  return '(' || author_str || ', ' || year_str || ', S. ' || p_page || ')';
end;
$$;

revoke all on function public.format_citation(jsonb, int, int) from public;
grant execute on function public.format_citation(jsonb, int, int) to authenticated;

create or replace function public.sync_passage_citations()
returns trigger
language plpgsql
as $$
begin
  if (new.authors is distinct from old.authors) or (new.year is distinct from old.year) then
    update public.passages
    set citation = public.format_citation(new.authors, new.year, page),
        updated_at = now()
    where source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sources_sync_passage_citations on public.sources;
create trigger sources_sync_passage_citations
  after update on public.sources
  for each row
  execute function public.sync_passage_citations();
