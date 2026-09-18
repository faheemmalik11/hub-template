-- Fills the output_vat stub in vat_reserve().
--
-- The function shipped with `0::numeric` hardcoded for output_vat and `0 - deductible` for the
-- reserve, from a time when there were no outgoing invoices to net against. Confirmed still true
-- live before writing this: the deployed body returns a literal zero.
--
-- Two things follow from that stub, both visible on the USt-Regeln screen:
--   * "Umsatzsteuer (Ausgang)" is permanently 0,00 EUR, so the column reads as "we collected no
--     VAT all year" rather than "this is not wired up".
--   * The reserve is therefore ALWAYS negative for any company with deductible input VAT, so a
--     screen that colours a negative reserve as "refund expected" would say that about every
--     company, every time.
--
-- public.outgoing_invoices carries amount_net and amount_gross, so collected VAT is
-- amount_gross - amount_net, summed per company and date range exactly like the input side.
-- Excludes 'draft' (not issued, so no VAT liability yet) and 'voided' (cancelled). Uses
-- voucher_date as the range anchor, mirroring invoices.document_date on the input side.
--
-- Re-runnable: create or replace, and the self-check only reads.

begin;

create or replace function public.vat_reserve(
  p_company uuid,
  p_von     date default null,
  p_bis     date default null
)
returns table (
  company_id                       uuid,
  von                              date,
  bis                              date,
  input_vat_total                  numeric,
  input_vat_deductible             numeric,
  input_vat_nondeductible          numeric,
  input_vat_unresolved_count       bigint,
  input_vat_unresolved_amount      numeric,
  output_vat                       numeric,
  reserve                          numeric
)
language sql
stable
set search_path = public
as $$
  with input as (
    select
      round(coalesce(sum(i.vat_amount), 0), 2)                                            as vat_total,
      round(coalesce(sum(i.vat_deductible_amount), 0), 2)                                 as vat_deductible,
      round(coalesce(sum(i.vat_nondeductible_amount), 0), 2)                              as vat_nondeductible,
      count(*) filter (where i.vat_amount is not null and i.vat_deductible_pct is null)    as unresolved_count,
      round(coalesce(sum(i.vat_amount) filter (where i.vat_deductible_pct is null), 0), 2) as unresolved_amount
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and i.company_id = p_company
       and (p_von is null or i.document_date >= p_von)
       and (p_bis is null or i.document_date <= p_bis)
  ),
  output as (
    select
      round(coalesce(sum(o.amount_gross - o.amount_net), 0), 2) as vat_total
      from public.outgoing_invoices o
     where o.deleted_at is null
       and o.company_id = p_company
       and o.voucher_status not in ('draft', 'voided')
       and o.amount_gross is not null
       and o.amount_net is not null
       and (p_von is null or o.voucher_date >= p_von)
       and (p_bis is null or o.voucher_date <= p_bis)
  )
  select
    p_company,
    p_von,
    p_bis,
    input.vat_total,
    input.vat_deductible,
    input.vat_nondeductible,
    input.unresolved_count,
    input.unresolved_amount,
    output.vat_total,
    output.vat_total - input.vat_deductible
    from input, output;
$$;

comment on function public.vat_reserve(uuid, date, date) is
  'Per-company VAT reserve (Briefing Screen 5): input-VAT summary (total, deductible, '
  'non-deductible, unresolved) plus output_vat from outgoing_invoices (amount_gross - '
  'amount_net, excluding draft/voided vouchers). reserve = output_vat - deductible input VAT, '
  'the amount owed to the tax office. A recommendation only, never a booking.';

grant execute on function public.vat_reserve(uuid, date, date) to authenticated;

-- Self-check. READ ONLY on purpose: this runs against a live client database, and an earlier
-- version of this migration elsewhere inserted a throwaway customer plus voucher and deleted them
-- again. That is a write to real tables to prove a read is correct, which is the wrong trade here.
-- Instead the function's own output is compared against the same sum computed inline.
do $$
declare
  v_company  uuid;
  v_fn       numeric;
  v_direct   numeric;
begin
  select o.company_id
    into v_company
    from public.outgoing_invoices o
   where o.deleted_at is null
     and o.voucher_status not in ('draft', 'voided')
     and o.amount_gross is not null
     and o.amount_net is not null
   limit 1;

  if v_company is null then
    raise notice 'vat_reserve self-check skipped: no issued outgoing invoice to check against';
    return;
  end if;

  select r.output_vat into v_fn from public.vat_reserve(v_company, null, null) r;

  select round(coalesce(sum(o.amount_gross - o.amount_net), 0), 2)
    into v_direct
    from public.outgoing_invoices o
   where o.deleted_at is null
     and o.company_id = v_company
     and o.voucher_status not in ('draft', 'voided')
     and o.amount_gross is not null
     and o.amount_net is not null;

  if v_fn is distinct from v_direct then
    raise exception 'vat_reserve self-check FAILED for company %: function returned %, direct sum is %',
      v_company, v_fn, v_direct;
  end if;

  raise notice 'vat_reserve self-check ok: output_vat = % for company %', v_fn, v_company;
end $$;

commit;
