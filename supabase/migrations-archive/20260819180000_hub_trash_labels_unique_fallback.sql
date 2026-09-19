-- Follow-up to 20260819120000. Two rows of the same type must not read identically.
--
-- That migration stopped `v_trash` from labelling anything with a bare primary key, which is what
-- finding #1 of docs/audit/papierkorb/trash/ISSUES.md asked for. It did not finish the job, and the
-- E2E suite caught it live: two soft-deleted invoices whose issuer, number, date AND amount are all
-- null both degrade to the same last-resort text, so the list shows
--
--     Eingangsrechnungen · Aussteller unbekannt · Verworfen, kein Beleg
--     Eingangsrechnungen · Aussteller unbekannt · Verworfen, kein Beleg
--
-- which is no more decidable than the two UUIDs it replaced — and is exactly the case the audit
-- called out ("the only thing distinguishing them from each other" was their identical reason).
--
-- THE RULE, applied once for every branch rather than repeated fourteen times: each branch now also
-- reports whether it actually found something identifying. Where it did not, the outer select
-- appends the first eight characters of the id as a reference. Short, and clearly a reference
-- rather than a name — the point of #1 was that a 36-character UUID *instead of* a label answers
-- nothing, not that an id may never appear at all. Where a branch did find a name, nothing is
-- appended and the label is unchanged.
--
-- Verified by `e2e/papierkorb.open-issues.spec.ts` — "two rows of the same type are told apart by
-- their labels", which fails against the previous definition and passes against this one.

begin;

create or replace view public.v_trash
with (security_invoker = true) as
select
  table_name,
  id,
  case
    when identifiziert then label
    else label || ' · Ref. ' || left(id::text, 8)
  end as label,
  deleted_at,
  deleted_by,
  delete_reason
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
    (coalesce(nullif(btrim(t.issuer), ''), nullif(btrim(t.invoice_number), '')) is not null
      or t.document_date is not null
      or t.amount_gross is not null) as identifiziert,
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
    nullif(btrim(t.name), '') is not null,
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
    nullif(btrim(t.name), '') is not null,
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
    (nullif(btrim(t.voucher_number), '') is not null
      or t.customer_id is not null
      or t.voucher_date is not null
      or t.amount_gross is not null),
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
    (nullif(btrim(t.note), '') is not null
      or t.company_id is not null
      or t.period is not null
      or t.amount is not null),
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
    (nullif(btrim(t.note), '') is not null
      or t.supplier_id is not null
      or t.property_id is not null
      or t.company_id is not null
      or t.min_amount is not null
      or nullif(btrim(t.step_1_approver), '') is not null),
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
    (coalesce(
       nullif(btrim(t.note), ''),
       nullif(btrim(t.reference_pattern), ''),
       nullif(btrim(t.cost_category), '')
     ) is not null
      or t.supplier_id is not null
      or t.property_id is not null),
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
    nullif(btrim(t.term), '') is not null,
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
    nullif(btrim(t.term), '') is not null,
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
    coalesce(nullif(btrim(t.code), ''), nullif(btrim(t.name_de), '')) is not null,
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
    coalesce(nullif(btrim(t.name), ''), nullif(btrim(t.code), '')) is not null,
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
    nullif(btrim(t.name), '') is not null,
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
    nullif(btrim(t.name), '') is not null,
    t.deleted_at,
    t.deleted_by,
    t.delete_reason
  from public.approvers t
  where t.deleted_at is not null
) trash
-- Unchanged from 20260819120000: the same admin check restore_record() and purge_record() carry.
where public.is_admin();

comment on view public.v_trash is
  'Soft-deleted records across every trash-eligible table. security_invoker, and admin-only: '
  'is_admin() here matches restore_record()/purge_record(). Labels are composed to be recognisable '
  'by a person; a row with nothing identifying gets a short id reference appended so two such rows '
  'are still two rows (docs/audit/papierkorb/trash/ISSUES.md #1, #11).';

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, as an admin, not part of the transaction above):
--
-- do $$
-- begin
--   assert not exists (
--     select 1 from public.v_trash
--      where label ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   ), 'a v_trash label is still a bare uuid';
--   assert not exists (
--     select table_name, label, count(*) from public.v_trash
--      group by table_name, label having count(*) > 1
--   ), 'two rows of the same type still read identically';
--   raise notice 'self-check ok';
-- end $$;
