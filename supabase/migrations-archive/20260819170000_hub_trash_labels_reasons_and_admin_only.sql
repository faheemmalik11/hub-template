-- Trash: readable labels, a deletion reason that is actually required, and a list only an admin
-- can read. Closes findings #1, #2 and #11 of docs/audit/papierkorb/trash/ISSUES.md. The other
-- seven findings on that screen are frontend-only and are fixed in src/routes/papierkorb/index.tsx
-- (age + cutoff filter, paging/search/sort, a confirmation on restore, bulk actions, the table
-- allow-lists read from this database rather than mirrored in a constant, a guard that explains
-- itself, an accessible padlock and a readable reason).
--
-- Every acceptance criterion below is an executable test: e2e/papierkorb.open-issues.spec.ts.
--
-- ---------------------------------------------------------------------------------------------
-- #1  THREE BRANCHES OF v_trash LABELLED THEIR ROWS WITH A PRIMARY KEY.
--
-- `COALESCE(invoices.issuer, invoices.invoice_number, invoices.id::text)` and its two siblings
-- meant the one screen for deciding "is this worth restoring" showed, for the records where the
-- decision matters most, a UUID. Measured live on the Immonetz sibling before this migration: 3 of 14 rows, including two
-- invoices distinguishable from each other by nothing but their identical deletion reason.
--
-- Every branch now composes a label out of the columns a person would actually use to recognise
-- the record, and the last resort is a description of the TYPE ('Aussteller unbekannt'), never an
-- id. `concat_ws` drops NULL parts, so a sparse row degrades to a shorter label rather than to a
-- string of separators. The joins are correlated subqueries rather than LEFT JOINs on purpose:
-- they keep each branch a single-table scan plus an index lookup, and this view is read a few
-- times a day by one admin.
--
-- German, like every other persisted string in this schema (see the `tDe` note in lib/i18n): this
-- is a value stored in a view that audit exports read, not UI chrome that follows the reader's
-- language.
--
-- ---------------------------------------------------------------------------------------------
-- #2  THE DELETION REASON WAS OPTIONAL EVERYWHERE, AND HALF THE TRASH HAD NONE.
--
-- Measured live on the Immonetz sibling: 6 of 14 rows with no usable reason, all six stored as empty strings rather than
-- NULL, and one customer's "reason" was a phone number somebody typed into the box.
--
-- The requirement cannot live in a dialog: `delete_reason` is written from a dozen call sites and
-- from plain SQL. The only place it holds for all of them is the table, so it is a trigger, on
-- every trash-eligible table, that fires exactly when a row is being soft-deleted or when its
-- reason is being changed. Restores (deleted_at -> NULL) and unrelated updates to an
-- already-deleted row are deliberately not affected — the trigger must not make a row unfixable.
--
-- Existing rows: empty strings are normalised to NULL, and rows already in the trash with no
-- reason get an explicit statement that none was recorded. Inventing a plausible reason for
-- somebody else's deletion would be worse than saying nothing; "none was recorded" is the true
-- statement, and it makes the trail complete.
--
-- ---------------------------------------------------------------------------------------------
-- #11 THE LIST ITSELF WAS NOT ADMIN-ONLY. (Found live while writing the E2E suite; not in the
--     audit document, which checked `security_invoker` and correctly found it sound.)
--
-- `v_trash` is security_invoker, so it runs with the caller's RLS rather than its owner's — which
-- is what the audit checked. But "RLS-filtered" is not "admin-only": every underlying table grants
-- `authenticated` a read, so a non-admin who never sees the menu entry and is bounced off the
-- route could still read the trash directly. Measured live from the assistant account: 9 of the 14
-- rows, with each record's label, who deleted it and why.
--
-- The screen was admin-only and both RPCs were admin-only, which is exactly what made this easy to
-- miss. The view now carries the same `is_admin()` check they do.
--
-- NOT closed by this migration, and deliberately so: a non-admin can still read soft-deleted rows
-- out of the BASE tables (`select * from suppliers where deleted_at is not null`). Fixing that
-- means an RLS predicate on thirteen tables, which changes what every other screen sees and is a
-- larger decision than this one. Recorded here so it is not mistaken for closed.
--
-- ---------------------------------------------------------------------------------------------
-- #3  RETENTION IS **NOT** AUTOMATED HERE, ON PURPOSE.
--
-- The audit asks for a retention policy. A scheduled job that hard-deletes records on a timer is
-- irreversible, and on this schema it is also a GoBD question (invoices may never be purged at
-- all). The screen now shows each record's age, can filter to "older than 30/90/365 days" and can
-- purge the selection in one action, which makes the cleanup a two-minute job instead of an
-- afternoon. Turning that into a cron job is the owner's decision, not this migration's.

begin;

-- ------------------------------------------------------------------- #1 + #11: the view --------

create or replace view public.v_trash
with (security_invoker = true) as
select *
from (
  select
    'invoices'::text as table_name,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.issuer), ''), 'Aussteller unbekannt'),
      nullif(btrim(t.invoice_number), ''),
      to_char(t.document_date, 'DD.MM.YYYY'),
      case when t.amount_gross is not null
           then btrim(to_char(t.amount_gross, 'FM999G999G990D00')) || ' ' || coalesce(nullif(t.currency, ''), 'EUR')
      end
    ) as label,
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.invoices t
  where t.deleted_at is not null
  union all
  select
    'suppliers'::text,
    t.id,
    coalesce(nullif(btrim(t.name), ''), 'Lieferant ohne Namen'),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.suppliers t
  where t.deleted_at is not null
  union all
  select
    'customers'::text,
    t.id,
    coalesce(nullif(btrim(t.name), ''), 'Kunde ohne Namen'),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.customers t
  where t.deleted_at is not null
  union all
  select
    'outgoing_invoices'::text,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.voucher_number), ''), 'Ausgangsrechnung ohne Nummer'),
      (select nullif(btrim(c.name), '') from public.customers c where c.id = t.customer_id),
      to_char(t.voucher_date, 'DD.MM.YYYY'),
      case when t.amount_gross is not null
           then btrim(to_char(t.amount_gross, 'FM999G999G990D00')) || ' ' || coalesce(nullif(t.currency, ''), 'EUR')
      end
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.outgoing_invoices t
  where t.deleted_at is not null
  union all
  select
    'manual_bookings'::text,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.note), ''), 'Manuelle Buchung'),
      (select nullif(btrim(co.name), '') from public.companies co where co.id = t.company_id),
      to_char(t.period, 'MM/YYYY'),
      case when t.amount is not null
           then btrim(to_char(t.amount, 'FM999G999G990D00')) || ' EUR'
      end
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.manual_bookings t
  where t.deleted_at is not null
  union all
  select
    'approval_rules'::text,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.note), ''), 'Freigabe-Regel'),
      (select nullif(btrim(s.name), '') from public.suppliers s where s.id = t.supplier_id),
      (select coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.code), ''))
         from public.properties p where p.id = t.property_id),
      (select nullif(btrim(co.name), '') from public.companies co where co.id = t.company_id),
      case when t.min_amount is not null
           then 'ab ' || btrim(to_char(t.min_amount, 'FM999G999G990D00')) || ' EUR'
      end,
      nullif(btrim(t.step_1_approver), '')
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.approval_rules t
  where t.deleted_at is not null
  union all
  select
    'assignment_rules'::text,
    t.id,
    concat_ws(' · ',
      coalesce(
        nullif(btrim(t.note), ''),
        nullif(btrim(t.reference_pattern), ''),
        nullif(btrim(t.cost_category), ''),
        'Zuordnungsregel'
      ),
      (select nullif(btrim(s.name), '') from public.suppliers s where s.id = t.supplier_id),
      (select coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.code), ''))
         from public.properties p where p.id = t.property_id)
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.assignment_rules t
  where t.deleted_at is not null
  union all
  select
    'ingest_exclusions'::text,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.term), ''), 'Ausschlussregel ohne Begriff'),
      nullif(btrim(t.scope), '')
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.ingest_exclusions t
  where t.deleted_at is not null
  union all
  select
    'opos_whitelist_rules'::text,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.term), ''), 'OPOS-Regel ohne Begriff'),
      nullif(btrim(t.scope), '')
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.opos_whitelist_rules t
  where t.deleted_at is not null
  union all
  select
    'bwa_categories'::text,
    t.id,
    concat_ws(' · ',
      coalesce(nullif(btrim(t.code), ''), 'Kategorie ohne Code'),
      nullif(btrim(t.name_de), '')
    ),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.bwa_categories t
  where t.deleted_at is not null
  union all
  select
    'properties'::text,
    t.id,
    coalesce(nullif(btrim(t.name), ''), nullif(btrim(t.code), ''), 'Objekt ohne Namen'),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.properties t
  where t.deleted_at is not null
  union all
  select
    'companies'::text,
    t.id,
    coalesce(nullif(btrim(t.name), ''), 'Gesellschaft ohne Namen'),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.companies t
  where t.deleted_at is not null
  union all
  select
    'approvers'::text,
    t.id,
    coalesce(nullif(btrim(t.name), ''), 'Genehmiger ohne Namen'),
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.approvers t
  where t.deleted_at is not null
) trash
-- #11: the same admin check restore_record() and purge_record() already carry. Evaluated once for
-- the whole union rather than per branch; is_admin() is STABLE, so the planner is free to hoist it.
where public.is_admin();

comment on view public.v_trash is
  'Soft-deleted records across every trash-eligible table. security_invoker, and admin-only: '
  'is_admin() here matches restore_record()/purge_record(). Labels are composed to be recognisable '
  'by a person -- never a bare primary key (docs/audit/papierkorb/trash/ISSUES.md #1, #11).';

-- ------------------------------------------------------------ #2: reasons, past and future -----

-- An empty string is not a reason. Normalise first, so `delete_reason is null` means exactly one
-- thing and the backfill below catches the rows that were empty strings too.
update public.invoices             set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.suppliers            set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.customers            set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.outgoing_invoices    set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.manual_bookings      set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.approval_rules       set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.assignment_rules     set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.ingest_exclusions    set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.opos_whitelist_rules set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.bwa_categories       set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.properties           set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.companies            set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';
update public.approvers            set delete_reason = null where deleted_at is not null and delete_reason is not null and btrim(delete_reason) = '';

-- Rows already in the trash with nothing recorded. See the header for why this text and not a
-- guess at what somebody meant.
update public.invoices             set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.suppliers            set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.customers            set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.outgoing_invoices    set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.manual_bookings      set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.approval_rules       set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.assignment_rules     set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.ingest_exclusions    set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.opos_whitelist_rules set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.bwa_categories       set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.properties           set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.companies            set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;
update public.approvers            set delete_reason = 'Kein Grund erfasst (vor Einführung der Begründungspflicht gelöscht)' where deleted_at is not null and delete_reason is null;

create or replace function public.trash_require_delete_reason()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if btrim(coalesce(new.delete_reason, '')) = '' then
    raise exception
      'Ein Löschgrund ist erforderlich (%.%): delete_reason darf beim Löschen nicht leer sein.',
      tg_table_schema, tg_table_name
      using errcode = 'check_violation',
            hint = 'Bitte einen Grund angeben, warum dieser Datensatz gelöscht wird.';
  end if;
  -- Store the trimmed value, so trailing whitespace cannot make a reason look present when it is
  -- one space long.
  new.delete_reason := btrim(new.delete_reason);
  return new;
end;
$$;

comment on function public.trash_require_delete_reason() is
  'BEFORE UPDATE guard for every trash-eligible table: a soft delete must say why. Fires only when '
  'a row is being deleted or its reason changed, never on a restore '
  '(docs/audit/papierkorb/trash/ISSUES.md #2).';

-- Attached to every table the trash system knows about, read from the same allow-list the RPCs
-- use, so a table added to trash_eligible_tables() cannot be forgotten here.
do $$
declare
  v_table text;
begin
  foreach v_table in array public.trash_eligible_tables()
  loop
    execute format('drop trigger if exists trash_require_delete_reason on public.%I', v_table);
    execute format(
      'create trigger trash_require_delete_reason '
      'before update on public.%I '
      'for each row '
      'when (new.deleted_at is not null '
      '      and (old.deleted_at is null or new.delete_reason is distinct from old.delete_reason)) '
      'execute function public.trash_require_delete_reason()',
      v_table
    );
  end loop;
end $$;

-- --------------------------------------------------- #5 (server half): a reason on restore -----

-- Restoring is the action with the wider blast radius of the two on this screen: an un-deleted
-- invoice re-enters the workflow and the P&L, an un-deleted rule starts matching again. The screen
-- now confirms it and offers a reason; this is where that reason is kept.
--
-- Dropped and recreated rather than overloaded: two functions of the same name, one with a
-- defaulted third argument, are ambiguous to Postgres for a two-argument call. One function with a
-- DEFAULT keeps BOTH call shapes working, so a frontend that has not shipped yet is unaffected.
drop function if exists public.restore_record(text, uuid);

create or replace function public.restore_record(p_table text, p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_rows   int;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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
  values (
    p_table,
    p_id,
    'restored',
    case
      when v_reason is null then 'Datensatz aus dem Papierkorb wiederhergestellt'
      else 'Datensatz aus dem Papierkorb wiederhergestellt: ' || v_reason
    end,
    v_actor,
    now()
  );
end;
$$;

-- Recreating the function resets its privileges, so the 0049/0050 grant hardening is repeated.
revoke execute on function public.restore_record(text, uuid, text) from public;
revoke execute on function public.restore_record(text, uuid, text) from anon;
grant execute on function public.restore_record(text, uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- declare v_id uuid;
-- begin
--   assert not exists (
--     select 1 from public.v_trash
--      where label ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   ), 'a v_trash label is still a bare uuid';
--   assert not exists (
--     select 1 from public.v_trash where btrim(coalesce(delete_reason, '')) = ''
--   ), 'a trashed record still has no reason';
--
--   insert into public.ingest_exclusions (scope, term, is_active)
--   values ('subject', 'ZZZ-SELFCHECK', false) returning id into v_id;
--   begin
--     update public.ingest_exclusions set deleted_at = now(), deleted_by = 'selfcheck' where id = v_id;
--     raise exception 'expected the blank-reason trigger to fire';
--   exception when check_violation then
--     raise notice 'correctly rejected: a soft delete needs a reason (expected)';
--   end;
--   delete from public.ingest_exclusions where id = v_id;
--   raise notice 'self-check ok';
-- end $$;
