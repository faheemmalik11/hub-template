-- 20260815130000_datev_routes_other_direction.sql
--
-- Adds a THIRD DATEV upload address per company: 'other', alongside the existing 'incoming' and
-- 'outgoing'.
--
-- WHY. DATEV issues a separate @uploadmail.datev.de address per document category, and the client
-- has three per company, not two -- incoming invoices, outgoing invoices, and everything else
-- (contracts, statements, correspondence). Until now `datev_routes.direction` only allowed the
-- first two, so the third address had nowhere to live and was kept outside the system.
--
-- WHAT THIS DOES NOT DO. Nothing sends 'other' yet. This mirrors exactly how migration 0051 shipped
-- 'outgoing' -- its own header says the direction was allowed "so the's outgoing route can be
-- entered now (from 1Password) ahead of that feature existing, but nothing reads it for an actual
-- send yet". Same here: the address becomes storable and editable in the admin screen, and the
-- handover flow is untouched (it still reads only 'incoming').
--
-- WHY datev_handover_batches WIDENS TOO. That table logs one row per send attempt and carries the
-- same direction vocabulary. Leaving it at two values would mean the first 'other' send ever
-- attempted fails on a constraint in the logging insert, after the mail has already gone out --
-- the worst possible place to discover the gap. Widening both keeps the two columns speaking the
-- same language, which is what a shared vocabulary column is for.
--
-- NO DATA CHANGE. Existing rows are untouched; this only widens what is permitted. Nothing is
-- seeded -- the real upload addresses are confidential (client's briefing: kept in 1Password) and
-- are entered by a human through the app's own admin screen, which writes them via
-- set_datev_route()'s blind write. That RPC needs no change: it never validated `direction`
-- itself, it relies on the table's CHECK, which is what this migration edits.
--
-- Idempotent: both constraints are dropped if present and recreated, so re-running converges.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.datev_routes') is null then
    v_missing := v_missing || 'table datev_routes';
  end if;
  if to_regclass('public.datev_handover_batches') is null then
    v_missing := v_missing || 'table datev_handover_batches';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. datev_routes.direction -- allow 'other'
-- ===========================================================================
-- The constraint is found by what it CHECKS rather than by name: 0038 created it inline
-- (`direction text not null check (...)`), so Postgres generated the name, and a hardcoded
-- "datev_routes_direction_check" would silently match nothing on a database where it was named
-- differently -- leaving the old two-value constraint in place while this migration reported
-- success.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'datev_routes'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%direction%'
  loop
    execute format('alter table public.datev_routes drop constraint %I', v_name);
  end loop;
end $$;

alter table public.datev_routes
  add constraint datev_routes_direction_check
  check (direction in ('incoming', 'outgoing', 'other'));

comment on column public.datev_routes.direction is
  'Which DATEV upload address this row holds for the company: ''incoming'' (incoming invoices), '
  '''outgoing'' (outgoing invoices) or ''other'' (everything else -- contracts, statements, '
  'correspondence). One row per company x direction; the address itself is a blind write, '
  'never readable back through the API (migration 0051).';

-- ===========================================================================
-- 2. datev_handover_batches.direction -- same vocabulary
-- ===========================================================================
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'datev_handover_batches'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%direction%'
  loop
    execute format('alter table public.datev_handover_batches drop constraint %I', v_name);
  end loop;
end $$;

alter table public.datev_handover_batches
  add constraint datev_handover_batches_direction_check
  check (direction in ('incoming', 'outgoing', 'other'));

-- ===========================================================================
-- 3. Self-checks
-- ===========================================================================

-- 3a. 'other' is now accepted, and the upsert still keys on (company_id, direction) so entering an
-- 'other' address does not disturb the company's existing two. Probed against a real company and
-- rolled back, the same way 0051 self-checks its own RPC.
do $$
declare
  v_company_id uuid;
  v_rows       int;
begin
  select id into v_company_id from public.companies limit 1;

  if v_company_id is null then
    raise notice 'self-check 3a skipped: no companies to probe with';
  else
    perform public.set_datev_route(v_company_id, 'incoming', 'in@example.invalid',  true, null, 'migration-selfcheck');
    perform public.set_datev_route(v_company_id, 'outgoing', 'out@example.invalid', true, null, 'migration-selfcheck');
    perform public.set_datev_route(v_company_id, 'other',    'oth@example.invalid', true, null, 'migration-selfcheck');

    select count(*) into v_rows
      from public.datev_routes
     where company_id = v_company_id
       and direction in ('incoming', 'outgoing', 'other');

    if v_rows <> 3 then
      raise exception 'self-check 3a FAILED: expected 3 routes for the probe company, got %', v_rows;
    end if;

    raise notice 'self-check 3a ok: all three directions coexist for one company';
  end if;

  raise exception using errcode = 'restrict_violation', message = 'self-check 3a rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 3b. A value outside the three is still refused, i.e. this widened the constraint rather than
-- removing it. A migration that accidentally dropped the CHECK and never re-added it would pass
-- 3a perfectly.
do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies limit 1;

  if v_company_id is null then
    raise notice 'self-check 3b skipped: no companies to probe with';
    return;
  end if;

  begin
    perform public.set_datev_route(v_company_id, 'nonsense', 'x@example.invalid', true, null, 'migration-selfcheck');
    raise exception 'self-check 3b FAILED: an invalid direction was accepted';
  exception
    when check_violation then
      raise notice 'self-check 3b ok: an invalid direction is still refused';
  end;

  raise exception using errcode = 'restrict_violation', message = 'self-check 3b rollback';
exception
  when restrict_violation then
    null;
end $$;

commit;

-- Sanity (run manually after applying):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'datev_routes_direction_check';
--   -- expect: CHECK (direction = ANY (ARRAY['incoming'::text, 'outgoing'::text, 'other'::text]))
