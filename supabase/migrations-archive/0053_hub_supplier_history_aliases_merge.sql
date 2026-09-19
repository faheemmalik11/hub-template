-- 0040 — Supplier identity over time (Briefing Screen 12): IBAN history, alias wiring, duplicate
-- detection, and merge. Data model + RPCs only — the UI lives in src/routes/suppliers/*.tsx and
-- the query hooks in src/lib/data/queries.ts.
--
-- Two corrections found while researching this, worth recording here since they shaped the design:
--   * The briefing claims an amount threshold and a spelling table "already exist in the system, do
--     not rebuild them." Neither exists anywhere in this repo — not in the live schema, not in the
--     external pipeline's own Python source (handover/pipeline/*.py). Those checks are only
--     *described* as intended design in the pipeline's own spec docs
--     (handover/docs/SPEC-EINGANGSRECHNUNG.md). The unusual-amount heuristic lives client-side in
--     src/lib/data/format.ts (detectUnusualAmount) as a disclosed, self-authored heuristic — nothing
--     to reuse here at the DB layer.
--   * There is no invoice-level "extracted IBAN" field distinct from the supplier's own IBAN — per
--     the briefing's own field catalog, IBAN is captured "in the supplier master record, maintained
--     once." So "an invoice contains a different IBAN" cashes out, in this app's actual data model,
--     as: suppliers.iban gets overwritten to a new value (by the pipeline via service-role, or by a
--     human in the Hub). An AFTER UPDATE trigger on suppliers is therefore both the IBAN-history
--     mechanism AND the changed-IBAN-warning signal — one mechanism, two requirements.
--
-- Live schema naming: targets the English-renamed live names (`suppliers`, `invoices`), same as
-- 0025/0035/0038/0039 — NOT the German names in the stale `supabase/schema.sql` snapshot. Note that
-- `suppliers`/`invoices` themselves predate this repo's versioned migration history entirely (no
-- `create table` for either exists in supabase/migrations/) — the merge RPC below is written to be
-- robust to that gap: it discovers foreign keys pointing at suppliers(id) dynamically via
-- pg_constraint rather than hardcoding a table list that could silently miss one.
--
-- Idempotent throughout: `if not exists`, `drop trigger/policy/function if exists`, lookup-driven
-- `do` blocks. Self-check at the end (insert/update/merge/verify/rollback probe).

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'suppliers'
  ) then
    raise exception 'Migration 0040 preconditions failed: table suppliers is missing';
  end if;
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'entity_aliases'
  ) then
    raise exception 'Migration 0040 preconditions failed: table entity_aliases is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. supplier_iban_history — trigger-populated only, never a direct write
-- ===========================================================================
create table if not exists public.supplier_iban_history (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  iban         text,
  bic          text,
  bank_name    text,
  changed_at   timestamptz not null default now(),
  changed_by   text
);

create index if not exists idx_supplier_iban_history_supplier
  on public.supplier_iban_history (supplier_id, changed_at desc);

alter table public.supplier_iban_history enable row level security;

drop policy if exists "supplier_iban_history_select" on public.supplier_iban_history;
create policy "supplier_iban_history_select" on public.supplier_iban_history
  for select to authenticated using (true);

-- No insert/update/delete policy for `authenticated` at all — this table is populated exclusively
-- by the trigger below (which runs as the table owner regardless of RLS), matching the
-- "mirror table, no direct write" convention already used for outgoing_invoices (migration 0039).

-- ===========================================================================
-- 2. Trigger: capture the OLD iban/bic/bank_name whenever suppliers.iban changes
-- ===========================================================================
create or replace function public.capture_supplier_iban_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.iban is distinct from old.iban then
    insert into public.supplier_iban_history (supplier_id, iban, bic, bank_name, changed_by)
    values (old.id, old.iban, old.bic, old.bank_name, coalesce(auth.uid()::text, 'pipeline'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_supplier_iban_history on public.suppliers;
create trigger trg_capture_supplier_iban_history
  after update on public.suppliers
  for each row
  execute function public.capture_supplier_iban_history();

-- ===========================================================================
-- 3. entity_aliases — RLS (currently has none at all; a real pre-existing gap). Hub may manage
--    only 'lieferant' aliases; company/property aliases stay pipeline/service-role-owned.
-- ===========================================================================
alter table public.entity_aliases enable row level security;

drop policy if exists "entity_aliases_select" on public.entity_aliases;
create policy "entity_aliases_select" on public.entity_aliases
  for select to authenticated using (true);

drop policy if exists "entity_aliases_insert_lieferant" on public.entity_aliases;
create policy "entity_aliases_insert_lieferant" on public.entity_aliases
  for insert to authenticated with check (entity_type = 'lieferant');

drop policy if exists "entity_aliases_update_lieferant" on public.entity_aliases;
create policy "entity_aliases_update_lieferant" on public.entity_aliases
  for update to authenticated using (entity_type = 'lieferant') with check (entity_type = 'lieferant');

-- Defense in depth: the Hub's "Bekannte Schreibweisen" add form disables its own submit button
-- for an empty/whitespace-only alias, but that is a UI-only guard — nothing stopped an
-- empty-string row from being inserted directly (verified: it wasn't rejected before this
-- constraint existed). A blank "known spelling" is never meaningful for any entity_type.
alter table public.entity_aliases drop constraint if exists entity_aliases_alias_not_blank;
alter table public.entity_aliases
  add constraint entity_aliases_alias_not_blank check (btrim(alias) <> '');

-- migration 0003's entity_aliases_uniq is a plain (non-partial) unique index, which was harmless
-- while this table only had pipeline-managed, never-deactivated rows. Now that the Hub can
-- deactivate a supplier alias (`useDeactivateSupplierAlias`), a plain unique index would
-- permanently block re-adding the exact same spelling after it was removed once (the inactive row
-- still occupies the unique slot). Scope the uniqueness to active rows only.
drop index if exists public.entity_aliases_uniq;
create unique index if not exists entity_aliases_uniq
  on public.entity_aliases (entity_type, entity_code, alias)
  where is_active;

-- ===========================================================================
-- 4. v_supplier_duplicates — replaces the effectively-dead v_lieferanten_duplicates (migration
--    0005; nothing in src/ ever queries it, and it was defined against the pre-rename table name).
--    Same normalized-name/VAT-ID collision logic, English-named, plus an added IBAN-collision axis.
-- ===========================================================================
drop view if exists public.v_lieferanten_duplicates;

create or replace view public.v_supplier_duplicates as
  select 'name'::text as key_type, normalized_name as key_value, count(*) as n,
         array_agg(id order by id) as ids
    from public.suppliers
   where deleted_at is null and normalized_name is not null and normalized_name <> ''
   group by normalized_name having count(*) > 1
  union all
  select 'vat_id', vat_id, count(*), array_agg(id order by id)
    from public.suppliers
   where deleted_at is null and vat_id is not null and vat_id <> ''
   group by vat_id having count(*) > 1
  union all
  select 'iban', iban, count(*), array_agg(id order by id)
    from public.suppliers
   where deleted_at is null and iban is not null and iban <> ''
   group by iban having count(*) > 1;

-- ===========================================================================
-- 5. merge_suppliers — SECURITY DEFINER, same convention as set_datev_route/set_lexoffice_config.
--    Dynamically reassigns every FK column referencing suppliers(id), preserves the merged-away
--    supplier's bank details into history if they differ, records its name as an alias, and
--    soft-deletes it. Never a hard delete (GoBD: "do not hard-delete, only deactivate + keep
--    history").
-- ===========================================================================
create or replace function public.merge_suppliers(
  p_keep_id   uuid,
  p_merge_id  uuid,
  p_merged_by text,
  p_reason    text default null
)
returns public.suppliers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep    public.suppliers;
  v_merge   public.suppliers;
  v_fk      record;
  v_result  public.suppliers;
begin
  if p_keep_id = p_merge_id then
    raise exception 'merge_suppliers: p_keep_id and p_merge_id must differ';
  end if;

  select * into v_keep from public.suppliers where id = p_keep_id;
  if not found then
    raise exception 'merge_suppliers: keep supplier % not found', p_keep_id;
  end if;
  if v_keep.deleted_at is not null then
    raise exception 'merge_suppliers: keep supplier % is already deleted', p_keep_id;
  end if;

  select * into v_merge from public.suppliers where id = p_merge_id;
  if not found then
    raise exception 'merge_suppliers: merge-away supplier % not found', p_merge_id;
  end if;
  if v_merge.deleted_at is not null then
    raise exception 'merge_suppliers: merge-away supplier % is already deleted', p_merge_id;
  end if;

  -- Reassign every FK column pointing at suppliers(id), across every table in `public`. Discovered
  -- dynamically rather than hardcoded: suppliers/invoices predate this repo's tracked migration
  -- history (renamed from German outside any versioned migration), so a hardcoded table list could
  -- silently miss a real FK. This also future-proofs the function against tables added later.
  for v_fk in
    select kcu.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and ccu.table_name = 'suppliers'
       and ccu.column_name = 'id'
       and kcu.table_name <> 'supplier_iban_history' -- reassigned explicitly below instead
  loop
    execute format(
      'update public.%I set %I = $1 where %I = $2',
      v_fk.table_name, v_fk.column_name, v_fk.column_name
    ) using p_keep_id, p_merge_id;
  end loop;

  -- Preserve the merged-away supplier's bank details if they differ from the survivor's, so
  -- nothing is silently lost even though only one IBAN can be "current" going forward.
  if v_merge.iban is not null and v_merge.iban is distinct from v_keep.iban then
    insert into public.supplier_iban_history (supplier_id, iban, bic, bank_name, changed_by)
    values (p_keep_id, v_merge.iban, v_merge.bic, v_merge.bank_name, p_merged_by);
  end if;

  -- Also carry the merged-away supplier's own history rows forward, so "IBAN-Verlauf" on the
  -- survivor stays complete.
  update public.supplier_iban_history set supplier_id = p_keep_id where supplier_id = p_merge_id;

  -- Remember the merged-away name as a known spelling of the survivor. The ON CONFLICT target
  -- must repeat entity_aliases_uniq's own `where is_active` predicate — conflict-target inference
  -- does not match a partial index unless the predicate is specified here too.
  insert into public.entity_aliases (entity_type, entity_code, alias, note)
  values ('lieferant', p_keep_id::text, v_merge.name, 'merged from ' || p_merge_id::text)
  on conflict (entity_type, entity_code, alias) where is_active do nothing;

  update public.suppliers
     set deleted_at = now(),
         deleted_by = p_merged_by,
         delete_reason = coalesce(p_reason, 'merged into ' || p_keep_id::text)
   where id = p_merge_id;

  select * into v_result from public.suppliers where id = p_keep_id;
  return v_result;
end;
$$;

grant execute on function public.merge_suppliers(uuid, uuid, text, text) to authenticated;

commit;

-- ===========================================================================
-- Self-check (run manually, or via a throwaway DB): proves the trigger fires, the dynamic-FK loop
-- actually reassigns a real FK, and the merge RPC leaves the expected end state. Always rolls back.
--
-- Verified against a throwaway Postgres 16 container with a minimal suppliers/invoices/
-- entity_aliases stub (this repo has no versioned `create table` for suppliers/invoices to build a
-- full replica from — they predate the tracked migration history, see the file header) — all
-- assertions below passed, plus RLS was verified separately: `authenticated` cannot insert directly
-- into supplier_iban_history (no policy grants it), and can only insert/update entity_aliases rows
-- where entity_type = 'lieferant'. On the LIVE schema, adjust the `insert into public.invoices`
-- line below to satisfy whatever NOT NULL columns actually exist there — the stub used here only
-- required `supplier_id`.
-- ===========================================================================
-- begin;
--   do $$
--   declare
--     s1 uuid; s2 uuid; inv uuid; hist_count int; alias_count int; merged public.suppliers;
--   begin
--     insert into public.suppliers (name, iban) values ('Test Merge A', 'DE1111') returning id into s1;
--     insert into public.suppliers (name, iban) values ('Test Merge B', 'DE2222') returning id into s2;
--
--     update public.suppliers set iban = 'DE3333' where id = s1; -- should log DE1111 into history
--     select count(*) into hist_count from public.supplier_iban_history where supplier_id = s1;
--     if hist_count <> 1 then raise exception 'trigger did not capture IBAN history'; end if;
--
--     insert into public.invoices (supplier_id) values (s2) returning id into inv; -- adjust to real
--     -- required columns for a live self-check run
--
--     merged := public.merge_suppliers(s1, s2, 'test-runner', 'self-check');
--     if merged.id <> s1 then raise exception 'merge_suppliers returned wrong row'; end if;
--
--     if not exists (select 1 from public.invoices where id = inv and supplier_id = s1) then
--       raise exception 'merge_suppliers did not reassign invoices.supplier_id';
--     end if;
--     if not exists (select 1 from public.suppliers where id = s2 and deleted_at is not null) then
--       raise exception 'merge_suppliers did not soft-delete the merged-away supplier';
--     end if;
--     select count(*) into alias_count from public.entity_aliases
--      where entity_type = 'lieferant' and entity_code = s1::text and alias = 'Test Merge B';
--     if alias_count <> 1 then raise exception 'merge_suppliers did not record the alias'; end if;
--     if not exists (
--       select 1 from public.supplier_iban_history where supplier_id = s1 and iban = 'DE2222'
--     ) then
--       raise exception 'merge_suppliers did not preserve merged-away supplier bank details';
--     end if;
--
--     raise exception using errcode = 'restrict_violation'; -- force rollback, self-check only
--   exception when restrict_violation then null;
--   end $$;
-- rollback;
