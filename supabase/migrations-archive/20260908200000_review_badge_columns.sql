-- Badge-aligned review columns on v_invoices_review.
--
-- The Review badge (ReviewBadge, fed by pruefGruende/ohnePruefungen in
-- src/features/invoice-detail/pruefung.ts) counts failed checks from three sources, newest first:
--   1. the per-check map: invoices.validation_detail (split into bookkeeping_edits/user_edits)
--      falling back to the copy inside extracted.validation_detail — corrections override,
--      only fields with a known reason id count, kleinbetrag/is_small_amount never count
--   2. the extracted.review_checks array — informational entries never count,
--      iban_anzahl maps by its iban_count value
--   3. the flat booleans: extracted.validation falling back to invoices.validation —
--      rechnungsnr/datum relaxed for Kleinbetrag invoices
-- review_score meanwhile is computed from tier 3 only, so filtering on it misses every invoice
-- whose failures live only in tiers 1 or 2 (~70 rows measured live on 2026-09-08).
--
-- These two columns are the SQL port of exactly that logic, so a "needs review" filter finds the
-- same rows the badge marks. review_score stays untouched — the Review-priority sort keeps its
-- existing behavior. Computed per query via pg_get_viewdef rebuild, no stored data.
--
-- review_problem_count: what the badge shows as "Needs review · N".
-- review_unchecked: pruefKarte reports nothing failed AND nothing passed (badge shows "Ungeprüft").

begin;

do $$
declare
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_review'
       and column_name = 'review_problem_count'
  ) then
    raise notice 'review_problem_count already present, skipping rebuild';
    return;
  end if;

  v_def := pg_get_viewdef('public.v_invoices_review'::regclass);
  execute format($fmt$
create or replace view public.v_invoices_review with (security_invoker = true) as
select sub.*,
  badge.review_problem_count,
  badge.review_unchecked
from (%s) sub
left join public.invoices bi on bi.id = sub.id
cross join lateral (
  select
    (case
       when raw.value ? 'bookkeeping_edits' then
         (case when jsonb_typeof(raw.value -> 'bookkeeping_edits') = 'object'
               then raw.value -> 'bookkeeping_edits' else '{}'::jsonb end)
       when jsonb_typeof(raw.value) = 'object' then raw.value
       else '{}'::jsonb
     end)
    || (case when jsonb_typeof(raw.value -> 'user_edits') = 'object'
             then raw.value -> 'user_edits' else '{}'::jsonb end) as detail,
    (case when jsonb_typeof(sub.extracted -> 'review_checks') = 'array'
           and jsonb_array_length(sub.extracted -> 'review_checks') > 0
      then sub.extracted -> 'review_checks' end) as checks,
    (case when jsonb_typeof(sub.extracted -> 'validation') = 'object'
      then sub.extracted -> 'validation'
      else coalesce(bi.validation, '{}'::jsonb) end) as flat
  from (
    select case
      when jsonb_typeof(bi.validation_detail) = 'object' and bi.validation_detail <> '{}'::jsonb
        then bi.validation_detail
      when jsonb_typeof(sub.extracted -> 'validation_detail') = 'object'
        then sub.extracted -> 'validation_detail'
      else '{}'::jsonb
    end as value
  ) raw
) src
cross join lateral (
  select
    case
      when src.detail <> '{}'::jsonb then (
        select count(*)::int from jsonb_each(src.detail) as entry(check_name, check_value)
        where entry.check_name in (
            'gross_present','issuer_present','sum_matches','vat_rate_valid','iban_checksum_valid',
            'date_not_future','invoice_number_present','date_present','payable_iban_present',
            'recipient_present','iban_unambiguous','relevance_ok','assignment_resolved',
            'brutto_vorhanden','steller_vorhanden','summe_ok','ust_satz_ok','iban_ok',
            'datum_plausibel','rechnungsnr_vorhanden','datum_vorhanden','iban_vorhanden',
            'empfaenger_vorhanden')
          and lower(coalesce(entry.check_value ->> 'status', '')) not in ('', 'ok', 'not_applicable', 'skipped')
      )
      when src.checks is not null then (
        select count(*)::int from jsonb_array_elements(src.checks) as review_check(value)
        where lower(coalesce(review_check.value ->> 'severity', '')) <> 'informational'
          and lower(coalesce(review_check.value ->> 'status', '')) not in ('', 'ok', 'not_applicable', 'skipped')
          and (review_check.value ->> 'field' = 'iban_anzahl'
               or (review_check.value ->> 'field') in (
                 'extraction_confidence','relevance','document_readable','exclusion',
                 'brutto_vorhanden','steller_vorhanden','summe_ok','ust_satz_ok','iban_ok',
                 'datum_plausibel','rechnungsnr_vorhanden','datum_vorhanden','empfaenger_name',
                 'assignment','safety_invariant_1','safety_invariant_2','safety_invariant_3',
                 'safety_invariant_4a','safety_invariant_4b','safety_invariant_5','forced_review'))
      )
      else (
          (case when src.flat ->> 'brutto_vorhanden' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'steller_vorhanden' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'summe_ok' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'ust_satz_ok' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'iban_ok' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'datum_plausibel' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'kleinbetrag' is distinct from 'true'
                 and src.flat ->> 'rechnungsnr_vorhanden' = 'false' then 1 else 0 end)
        + (case when src.flat ->> 'kleinbetrag' is distinct from 'true'
                 and src.flat ->> 'datum_vorhanden' = 'false' then 1 else 0 end)
      )
    end as review_problem_count,
    case
      when src.detail <> '{}'::jsonb then
        not exists (
          select 1 from jsonb_each(src.detail) as entry(check_name, check_value)
          where entry.check_name not in ('kleinbetrag', 'is_small_amount')
            and lower(coalesce(entry.check_value ->> 'status', '')) not in ('', 'not_applicable', 'skipped')
        )
      when src.checks is not null then
        not exists (
          select 1 from jsonb_array_elements(src.checks) as review_check(value)
          where lower(coalesce(review_check.value ->> 'severity', '')) <> 'informational'
            and lower(coalesce(review_check.value ->> 'status', '')) not in ('', 'not_applicable', 'skipped')
        )
      else
        not exists (
          select 1 from jsonb_each_text(src.flat) as gate(gate_name, gate_value)
          where gate.gate_name in (
              'brutto_vorhanden','steller_vorhanden','datum_vorhanden','rechnungsnr_vorhanden',
              'summe_ok','ust_satz_ok','iban_ok','datum_plausibel')
            and (gate.gate_value = 'true'
                 or (gate.gate_value = 'false'
                     and (gate.gate_name not in ('rechnungsnr_vorhanden', 'datum_vorhanden')
                          or src.flat ->> 'kleinbetrag' is distinct from 'true')))
        )
    end as review_unchecked
) badge
$fmt$, rtrim(btrim(v_def), ';'));
end $$;

commit;
