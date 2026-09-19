-- 0055_income_tax_treatment.sql
-- Herstellungsaufwand vs. Erhaltungsaufwand (production vs. maintenance expense) — closes a gap
-- found during a briefing-vs-implementation audit: the brief lists this alongside Bewirtung/
-- Anzahlung as a tax special case that "cannot be squeezed into the category — needs its own flag
-- on the receipt" (see vat_special_case, migration 0031). It is NOT a VAT question (it doesn't
-- change vat_deductible_pct) — it's an income-tax/capitalization question (must the cost be
-- capitalized and depreciated over the building's life, or is it immediately deductible as a
-- repair/maintenance expense) — so it gets its own column rather than a third vat_special_case
-- value, which would misleadingly live under a "vat_" name.
--
-- Deliberately minimal: a plain nullable, human-set flag. No rule-engine target, no generated
-- columns, no trigger — unlike vat_special_case/vat_deductible_pct (which the briefing explicitly
-- tied to the rule engine and a tax-reserve calculation), the briefing only asks for "a flag" here.

begin;

alter table public.invoices
  add column if not exists income_tax_treatment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and conname = 'invoices_income_tax_treatment_check'
  ) then
    alter table public.invoices add constraint invoices_income_tax_treatment_check
      check (income_tax_treatment is null
             or income_tax_treatment in ('herstellungsaufwand', 'erhaltungsaufwand'));
  end if;
end $$;

comment on column public.invoices.income_tax_treatment is
  'Herstellungsaufwand (capitalize/depreciate) vs. Erhaltungsaufwand (immediately deductible '
  'repair/maintenance expense) — an income-tax classification, distinct from vat_special_case '
  '(VAT deductibility). NULL means not applicable/not yet decided. Human-set only, no rule-engine '
  'target. See migration 0055.';

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually):
--
-- select column_name, data_type from information_schema.columns
--  where table_name = 'invoices' and column_name = 'income_tax_treatment';
-- update public.invoices set income_tax_treatment = 'unsinn' where false; -- would fail the check
