-- A removed bank account goes to the Papierkorb, like everything else that gets deleted here.
--
-- Migration 20260828120000 made removing an account a hard delete, because a hidden account showed
-- up nowhere and could not be restored. That fixed the limbo by throwing the record away. This is
-- the better answer to the same problem: the account is soft-deleted, it appears in the trash, it
-- can be restored from there, and emptying it from the trash is what finally deletes the row.
--
-- purge_record() already does the right thing for that last step. It is admin-only and snapshots
-- the whole row into change_history before deleting, so an account somebody was once paid on stays
-- explainable even after it is gone. That is what the original no-delete-policy design was for, and
-- it is better served here than by keeping dead rows forever.
--
-- WHAT DOES NOT APPEAR IN THE TRASH: an account hidden because its SUPPLIER was deleted. That
-- account was not deleted, the supplier was, and restoring the supplier brings its accounts back
-- with it. Listing them separately would put five rows in the trash for one action, four of which
-- nobody chose to delete, and restoring one on its own would leave it behind a supplier you still
-- cannot open.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Eligible for the trash, and for being emptied out of it
-- ---------------------------------------------------------------------------------------------
create or replace function public.trash_eligible_tables() returns text[]
language sql immutable set search_path to 'public' as $$
  select array[
    'invoices', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'bwa_categories', 'properties', 'companies', 'business_line', 'approvers',
    'supplier_bank_accounts'
  ];
$$;

-- trash_purge_eligible_tables() derives from the list above and excludes invoices and approvers,
-- so supplier_bank_accounts is purgeable without touching it.

-- ---------------------------------------------------------------------------------------------
-- The view
-- ---------------------------------------------------------------------------------------------
-- The existing view is kept whole under a new name and wrapped, rather than restated here. It is
-- long, every branch of it is somebody's careful labelling, and re-typing it into this migration
-- would be the most likely way to break one of them.
do $$
begin
    if to_regclass('public.v_trash') is null then
        raise notice 'public.v_trash not found, skipping the trash branch';
        return;
    end if;
    if to_regclass('public.v_trash_base') is null then
        execute 'alter view public.v_trash rename to v_trash_base';
    end if;
end $$;

do $$
begin
    if to_regclass('public.v_trash_base') is null then
        return;
    end if;

    execute $view$
      create or replace view public.v_trash
      with (security_invoker = true) as
        select table_name, id, label, deleted_at, deleted_by, delete_reason
          from public.v_trash_base
        union all
        select 'supplier_bank_accounts'::text as table_name,
               a.id,
               concat_ws(' · ',
                 coalesce(nullif(btrim(s.name), ''), 'Lieferant unbekannt'),
                 -- Grouped in fours, the way every screen shows an IBAN.
                 btrim(regexp_replace(a.iban, '(.{4})', '\1 ', 'g')),
                 nullif(btrim(coalesce(a.bank_name, '')), '')
               ) as label,
               a.deleted_at,
               a.deleted_by,
               a.delete_reason
          from public.supplier_bank_accounts a
          join public.suppliers s on s.id = a.supplier_id
         where a.deleted_at is not null
           -- Hidden WITH its supplier: the supplier's own trash entry restores it.
           and s.deleted_at is null
    $view$;

    grant select on public.v_trash to authenticated, service_role;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Only the trash may delete
-- ---------------------------------------------------------------------------------------------
-- The delete policy from 20260828120000 let the browser remove a row directly, which is exactly
-- what this migration is undoing. purge_record() is SECURITY DEFINER, so emptying the trash still
-- works without it, and it is the only path that writes the change_history snapshot first.
drop policy if exists "supplier_bank_accounts_delete" on public.supplier_bank_accounts;

-- The BEFORE DELETE guard from 20260828120000 stays. suppliers.iban points at the default and the
-- payment path reads that column, so it must not be purgeable either.

insert into public.package_migrations (version)
values ('0013_supplier_bank_accounts_in_trash')
on conflict (version) do nothing;
