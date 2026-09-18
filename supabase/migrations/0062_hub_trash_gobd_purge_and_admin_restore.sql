-- 0049_trash_gobd_purge_and_admin_restore.sql
-- Closes three gaps flagged in docs/TRASH_AND_DELETE.md §3 against migration 0046, per an
-- explicit decision from the app's owner (not a unilateral call -- both were compliance/
-- permission questions the doc itself said needed a human decision):
--
--   1. §3.1 GoBD: "do not hard-delete receipts -- only deactivate + keep history" (Appendix A8).
--      purge_record() used to hard-delete invoices too, with only a change_history JSON snapshot
--      as the trail. Decision: block purge for invoices outright. Invoices can be soft-deleted
--      and restored, but never purged -- the change_history snapshot is not treated as sufficient
--      "keep history" for a receipt in a GoBD sense.
--   2. §3.5 restore_record() had no admin check while purge_record() did, even though /papierkorb
--      itself is admin-only in the nav. Decision: make restore admin-only too, so the RLS layer
--      matches what the UI already implied end-to-end.
--   3. §3.3 the 13-table allow-list was hand-duplicated across restore_record(), purge_record()
--      and the frontend's TABLE_FILTERS. Centralized the RPC side into trash_eligible_tables()/
--      trash_purge_eligible_tables() -- v_trash's UNION ALL (migration 0047) and the frontend
--      filter still can't read a table list dynamically (different columns per table / no round
--      trip for a static UI constant), so those two stay manually kept in sync; this closes 2 of
--      the 4 spots, which is the "centralize opportunistically" note the doc asked for.

begin;

-- Single source of truth for "which tables does the trash system know about" -- the RPCs below
-- both use this instead of a copy of the same array literal.
create or replace function public.trash_eligible_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'invoices', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'bwa_categories', 'properties', 'companies', 'business_line'
  ];
$$;

-- GoBD (§3.1): every trash-eligible table except invoices may be purged.
create or replace function public.trash_purge_eligible_tables()
returns text[]
language sql
immutable
as $$
  select array_remove(public.trash_eligible_tables(), 'invoices');
$$;

revoke execute on function public.trash_eligible_tables() from public;
revoke execute on function public.trash_purge_eligible_tables() from public;
grant execute on function public.trash_eligible_tables() to authenticated;
grant execute on function public.trash_purge_eligible_tables() to authenticated;

-- restore_record: now admin-only (§3.5), and reads the centralized allow-list.
create or replace function public.restore_record(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_rows  int;
begin
  if not public.is_admin() then
    raise exception 'restore_record: admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'restore_record: table and id are required';
  end if;
  if not (p_table = any(public.trash_eligible_tables())) then
    raise exception 'restore_record: table % is not trash-eligible', p_table;
  end if;

  -- GET DIAGNOSTICS, not FOUND: unreliable after a dynamic EXECUTE ... USING UPDATE on this
  -- project, per migration 0046's own note.
  execute format(
    'update public.%I set deleted_at = null, deleted_by = null, delete_reason = null '
    'where id = $1 and deleted_at is not null',
    p_table
  ) using p_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'restore_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, at)
  values (p_table, p_id, 'restored', 'Datensatz aus dem Papierkorb wiederhergestellt', v_actor, now());
end;
$$;

-- purge_record: GoBD-safe (§3.1). invoices is rejected with a specific, actionable error rather
-- than the generic "not trash-eligible" one, since invoices genuinely IS trash-eligible (it can
-- be soft-deleted and restored) -- it is purge that is specifically disallowed for it. The old
-- purge_invoice() special case is now unreachable from here and removed; nothing else calls it
-- (confirmed by grep across supabase/ and src/), so it is left in place as a DB object but unused.
create or replace function public.purge_record(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_snapshot jsonb;
begin
  if not public.is_admin() then
    raise exception 'purge_record: admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'purge_record: table and id are required';
  end if;
  if p_table = 'invoices' then
    raise exception
      'purge_record: invoices cannot be purged -- GoBD requires receipts to be deactivated and '
      'kept, never hard-deleted. Restore it or leave it in the trash.'
      using errcode = 'insufficient_privilege';
  end if;
  if not (p_table = any(public.trash_purge_eligible_tables())) then
    raise exception 'purge_record: table % is not trash-eligible', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 and deleted_at is not null', p_table)
    into v_snapshot using p_id;
  if v_snapshot is null then
    raise exception 'purge_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values (p_table, p_id, 'purged', 'Datensatz endgültig gelöscht', v_actor, v_snapshot, now());

  execute format('delete from public.%I where id = $1', p_table) using p_id;
end;
$$;

revoke execute on function public.restore_record(text, uuid) from public;
revoke execute on function public.purge_record(text, uuid) from public;
grant execute on function public.restore_record(text, uuid) to authenticated;
grant execute on function public.purge_record(text, uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- declare
--   v_invoice uuid;
-- begin
--   assert (select 'invoices' = any(public.trash_eligible_tables())), 'invoices must stay restore-eligible';
--   assert not (select 'invoices' = any(public.trash_purge_eligible_tables())), 'invoices must not be purge-eligible';
--   assert (select 'suppliers' = any(public.trash_purge_eligible_tables())), 'suppliers must stay purge-eligible';
--
--   select id into v_invoice from public.invoices where deleted_at is not null limit 1;
--   if v_invoice is not null then
--     begin
--       perform public.purge_record('invoices', v_invoice);
--       raise exception 'expected purge_record to reject invoices';
--     exception when insufficient_privilege then
--       raise notice 'correctly rejected: invoices cannot be purged (expected)';
--     end;
--   end if;
--
--   raise notice 'self-check ok';
-- end $$;
