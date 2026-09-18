-- The permission catalogue had one `description` column, rendered in both languages, so an English
-- session read German help text under English labels. Split it, matching label_de / label_en.
--
-- The old column is renamed rather than dropped, so no seeded text is lost on a Hub that has not
-- re-run its seed yet: existing rows keep their German description and simply have no English one
-- until the seed supplies it (the UI falls back to the German text rather than showing nothing).

-- Guarded: on the Stäy database the rename already happened out-of-band, in the same 2026-08-28
-- hand-application that 20260829190000 documents, so `description` is gone and `description_de`
-- is already there. An unguarded rename fails with `column "description" does not exist` and
-- stops the push. On a fresh project the column is present and the rename runs as written.
do $guard$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'permissions' and column_name = 'description'
  ) then
    alter table public.permissions rename column description to description_de;
  else
    raise notice 'permissions.description already renamed to description_de; skipping.';
  end if;
end
$guard$;
alter table public.permissions add column if not exists description_en text;
