-- Small helpers every other file may use. No tables, no policies, no client anything.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
-- Semantic search over documents. A client who never asks a question in words still pays nothing
-- for having it available.
create extension if not exists vector;

-- A folder path as a client writes one: absolute, trimmed, no trailing slash, no doubled slash and
-- no control characters. Null means nothing is set, which is always allowed.
create or replace function public.is_folder_path(p_path text) returns boolean
language sql immutable
as $$
  select p_path is null
      or (btrim(p_path) = p_path
          and left(p_path, 1) = '/'
          and length(p_path) > 1
          and right(p_path, 1) <> '/'
          and p_path !~ '[[:cntrl:]]'
          and p_path not like '%//%');
$$;

-- Name matching that survives how a name is actually typed on a document.
create or replace function public.normalized_name(p_name text) returns text
language sql immutable
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')), '');
$$;

-- Attach where a table should stamp itself rather than trust the caller.
create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

commit;
