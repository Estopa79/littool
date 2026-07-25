-- Paket 1: Privater Storage-Bucket "pdfs"

insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Nur eingeloggte Nutzer dürfen lesen/schreiben/löschen. Kein Public-Zugriff.
create policy "pdfs_authenticated_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'pdfs');

create policy "pdfs_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'pdfs');

create policy "pdfs_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'pdfs')
  with check (bucket_id = 'pdfs');

create policy "pdfs_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'pdfs');
