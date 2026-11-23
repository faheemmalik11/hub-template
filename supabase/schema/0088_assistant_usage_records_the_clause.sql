-- assistant_usage recorded the question, the language and the intent, but not the WHERE clause the
-- model actually produced. When a question returns nothing there is then no way to tell a wrong
-- clause from an empty result, which is exactly the wall a live German-vs-English difference ran
-- into: both classified the same, both succeeded, one found rows and the other did not, and
-- nothing anywhere recorded why.

begin;

alter table public.assistant_usage
    add column if not exists where_clause text,
    add column if not exists rejected_where_clause text,
    add column if not exists match_count integer;

commit;
