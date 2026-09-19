-- purge_record() reports the wrong reason for approvers.
--
-- 20260813110000 made approvers trash-eligible but deliberately NOT purge-eligible (approvers.name
-- is the target of three foreign keys -- purging somebody used as a deputy would silently blank
-- that deputy via ON DELETE SET NULL). It did that by excluding the table from
-- trash_purge_eligible_tables(), which makes purge_record() fall into its generic branch and raise
-- "table approvers is not trash-eligible" -- factually wrong, since approvers IS trash-eligible
-- (it appears in v_trash and restores fine). Only the purge is disallowed.
--
-- invoices already has a dedicated, accurate message for exactly this shape (0062); approvers gets
-- the same treatment. The Papierkorb UI hides the button either way, so this only ever reaches a
-- direct RPC caller -- which is precisely the caller with no other way to find out why.
--
-- Function body otherwise unchanged from 0062. CREATE OR REPLACE keeps the 0062 grants
-- (revoke from public, execute to authenticated).

begin;

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
  if p_table = 'approvers' then
    raise exception
      'purge_record: approvers cannot be purged -- approval_rules and approvers.deputy_name '
      'reference approvers(name), and purging a deputy would silently blank that reference. '
      'Restore it or leave it in the trash.'
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

commit;
