-- PGlite-only Storage metadata model. Does not simulate file transfers or signed URLs.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
