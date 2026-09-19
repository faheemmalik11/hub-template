-- 0015_exclusion_scopes — widen ingest_exclusions.scope so rules can match more than the email
-- envelope (Briefing Screen 14, "Exclusion rules"). Adds four post-read scopes:
--   body     — the extracted full text (volltext)
--   company  — the resolved company code (e.g. IMKO)
--   property — the resolved property/object code (e.g. GRSC12)
--   supplier — the invoice issuer (supplier) name
-- (the existing party/sender/subject/filename/envelope scopes are unchanged). Action stays "exclude"
-- (a match skips the item — status 'ausgeschlossen'). Idempotent: drops whatever CHECK currently
-- guards `scope`, then re-adds the widened one.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0015_exclusion_scopes.sql

begin;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.ingest_exclusions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%scope%'
  loop
    execute format('alter table public.ingest_exclusions drop constraint %I', c);
  end loop;
end $$;

alter table public.ingest_exclusions
  add constraint ingest_exclusions_scope_check
  check (scope in ('party', 'sender', 'subject', 'filename', 'envelope',
                   'body', 'company', 'property', 'supplier'));

commit;

-- Sanity: insert into ingest_exclusions (scope, term, is_active) values ('company','IMGM',true);
