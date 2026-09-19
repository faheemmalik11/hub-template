-- 0044_remove_microsoft_mail_provider.sql
-- Product decision: Microsoft/Outlook mail support is not needed. mail_settings (migration 0026)
-- was built provider-generic ("the briefing insists the Microsoft path is thought through from the
-- start") specifically to accommodate it later; that reason is gone, so the row and the option are
-- removed.
--
-- Scope decision: this drops the Microsoft VALUE, not the provider column/shape. The external
-- ai-mail-extraction pipeline's db.py builds its query around a `provider` column that must keep
-- existing (`mail_settings(conn, provider="google")`) — collapsing the table to a single-row,
-- provider-less shape would silently break that pipeline's DB contract for no real benefit, since
-- the microsoft row was 100% inert scaffolding (is_active=false, every field null/empty) to begin
-- with. The frontend gets fully simplified in the same commit (no more per-provider Map/tabs), but
-- that's a same-repo, fully-controlled change; the DB stays conservative.
--
-- Idempotent: safe to rerun (delete matches zero rows the second time, constraint add is guarded).

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'mail_settings')
  then
    raise exception '0044 preconditions failed: table mail_settings is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mail_settings'
                    and column_name = 'provider')
  then
    raise exception '0044 preconditions failed: column mail_settings.provider is missing';
  end if;
  raise notice '0044 preconditions ok';
end $$;

delete from public.mail_settings where provider = 'microsoft';

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.mail_settings'::regclass
       and conname = 'mail_settings_provider_check'
  ) then
    alter table public.mail_settings drop constraint mail_settings_provider_check;
  end if;
  alter table public.mail_settings
    add constraint mail_settings_provider_check check (provider = 'google');
end $$;

comment on column public.mail_settings.provider is
  'Always ''google'' — Microsoft/Outlook support was designed for but never built, and the option '
  'was removed. Column kept (not collapsed to a provider-less single row) so the external '
  'ai-mail-extraction pipeline''s existing provider-keyed query stays valid.';

-- ---------------------------------------------------------------------------
-- Self-check (wrapped so it changes nothing; safe to run directly against the live dev DB)
-- ---------------------------------------------------------------------------
-- begin;
-- do $$
-- declare
--   v_count int;
-- begin
--   select count(*) into v_count from public.mail_settings;
--   if v_count <> 1 then
--     raise exception '0044 self-check FAILED: expected exactly 1 row, found %', v_count;
--   end if;
--   if not exists (select 1 from public.mail_settings where provider = 'google') then
--     raise exception '0044 self-check FAILED: the remaining row is not google';
--   end if;
--   begin
--     insert into public.mail_settings (provider) values ('microsoft');
--     raise exception '0044 self-check FAILED: inserting a microsoft row was not rejected';
--   exception when check_violation then
--     raise notice '0044 self-check: microsoft insert correctly rejected';
--   end;
--   raise notice '0044 self-check PASSED';
-- end $$;
-- rollback;

commit;
