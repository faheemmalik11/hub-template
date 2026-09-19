-- merge_suppliers() left the merged-away supplier's own aliases behind.
--
-- entity_aliases.entity_code is text, not a foreign key, so the dynamic FK loop that reassigns
-- everything else pointing at suppliers(id) never sees those rows. They stayed pointing at a
-- supplier that no longer exists, which was untidy but harmless -- until 20260824110000 added
-- entity_aliases_one_owner_uniq. From then on a dead row goes on holding its spelling against every
-- other entity of the same type, the survivor included, so a name the merged-away supplier was
-- known by becomes a name nothing can ever be known by again. Two merges in a chain (A into B,
-- later B into C) is the case that shows it.
--
-- Two things change here:
--
--   * the merged-away supplier's active aliases move to the survivor, and any the survivor already
--     holds are deactivated rather than moved, so nothing is lost and no slot is left occupied;
--
--   * the name-as-alias insert can no longer abort the merge. It used to name a conflict target,
--     which only ever covered entity_aliases_uniq -- a clash on entity_aliases_one_owner_uniq was
--     not swallowed and rolled the whole merge back.
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

  -- Carry the merged-away supplier's aliases across. A move changes entity_code and nothing else,
  -- and entity_aliases_one_owner_uniq is keyed on (entity_type, folded(alias)), so it is indifferent
  -- to the move: the only index a move can violate is entity_aliases_uniq, and the guard below is
  -- exactly its columns. It deliberately does not test is_active -- that index is partial on three
  -- of the four Hubs and plain on Immonetz, and ignoring is_active is the correct guard under both.
  update public.entity_aliases a
     set entity_code = p_keep_id::text,
         updated_at = now()
   where a.entity_type = 'lieferant'
     and a.entity_code = p_merge_id::text
     and a.is_active
     and not exists (
       select 1 from public.entity_aliases k
        where k.entity_type = 'lieferant'
          and k.entity_code = p_keep_id::text
          and k.alias = a.alias);

  -- Whatever could not move is a spelling the survivor already has. Deactivated rather than deleted,
  -- so the record survives (GoBD) and the one-owner slot the dead row would keep is released.
  update public.entity_aliases
     set is_active = false,
         updated_at = now(),
         note = coalesce(note || ' | ', '') || 'deactivated by merge into ' || p_keep_id::text
   where entity_type = 'lieferant'
     and entity_code = p_merge_id::text
     and is_active;

  -- Remember the merged-away name as a known spelling of the survivor.
  --
  -- ON CONFLICT carries no target on purpose. A target has to repeat the predicate of the index it
  -- names, and entity_aliases_uniq is partial here but plain on Immonetz -- and naming either one
  -- leaves a clash on entity_aliases_one_owner_uniq unswallowed, which would roll back the entire
  -- merge to avoid losing a single alias. Untargeted, it takes DO NOTHING on any unique index.
  --
  -- The blank test is separate because ON CONFLICT does not swallow a CHECK violation, and
  -- entity_aliases_alias_not_blank refuses an empty alias.
  if btrim(coalesce(v_merge.name, '')) <> '' then
    insert into public.entity_aliases (entity_type, entity_code, alias, note)
    values ('lieferant', p_keep_id::text, v_merge.name, 'merged from ' || p_merge_id::text)
    on conflict do nothing;
  end if;

  update public.suppliers
     set deleted_at = now(),
         deleted_by = p_merged_by,
         delete_reason = coalesce(p_reason, 'merged into ' || p_keep_id::text)
   where id = p_merge_id;

  select * into v_result from public.suppliers where id = p_keep_id;
  return v_result;
end;
$function$
