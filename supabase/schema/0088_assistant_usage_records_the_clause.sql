begin;

alter table public.assistant_usage
    add column if not exists where_clause text,
    add column if not exists rejected_where_clause text,
    add column if not exists match_count integer;

commit;
