-- 0093_drop_tags.sql
-- Removes the tags feature (migration 0017): the `tags` label catalog and the `invoice_tags`
-- many-to-many link. Mirrors immonetz's own tag removal (migration 20260805160416_drop_tags.sql) —
-- the feature was removed from the front end (nav entries, screens, hooks, types), so the tables
-- backing it are dropped here rather than left orphaned.

begin;

drop table if exists public.invoice_tags;
drop table if exists public.tags;

commit;
