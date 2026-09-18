-- merge_suppliers() reassigns supplier_iban_history explicitly but left supplier_bank_accounts to
-- the generic FK loop, so a merge blindly rewrote supplier_id on every account row. That breaks the
-- moment both suppliers already hold the same IBAN (plausible: they are the same real business),
-- because supplier_bank_accounts_one_per_iban then refuses the second row and the whole merge fails.
--
-- Fixed the same way supplier_iban_history already is: excluded from the generic loop, carried over
-- explicitly, keeping whichever row the survivor already had on any account both parties held.
--
-- Re-runnable: CREATE OR REPLACE FUNCTION replaces the body outright each time.

create or replace function public.merge_suppliers(p_keep_id uuid, p_merge_id uuid, p_merged_by text, p_reason text DEFAULT NULL::text)
 returns suppliers
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
       and kcu.table_name not in ('supplier_iban_history', 'supplier_bank_accounts') -- reassigned explicitly below instead
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

  -- Move every account the merged-away supplier held onto the survivor. Where both already hold
  -- the same IBAN the survivor's own row wins and the duplicate is simply dropped afterwards, never
  -- overwritten, since a name or verification somebody already checked must not be replaced blind.
  insert into public.supplier_bank_accounts (supplier_id, iban, bic, bank_name, source, is_active, created_by)
  select p_keep_id, iban, bic, bank_name, source, is_active, created_by
    from public.supplier_bank_accounts
   where supplier_id = p_merge_id
  on conflict (supplier_id, iban) do nothing;

  delete from public.supplier_bank_accounts where supplier_id = p_merge_id;

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
$function$
