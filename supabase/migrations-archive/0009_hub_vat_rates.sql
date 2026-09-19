-- 0006 — vat_rates: the valid VAT rates the validation gate accepts, as editable DB rows.
--
-- Replaces the hard-coded {0,7,19} in the pipeline. Rates now live here so they can be edited from a UI when
-- tax law changes or a new country is added (e.g. Spain 21/10/4), with no code change. The gate checks the
-- rate VALUE against the active set; `country` is metadata for humans/UI. Pipeline reads this via
-- db.vat_rates() -> vat_rules.load(); falls back to the German rates if this table is empty/absent.
-- Additive + idempotent + transactional.

begin;

create table if not exists vat_rates (
  id         uuid primary key default gen_random_uuid(),
  country    text,                      -- 'DE', 'ES', ... (label only; the check uses the rate value)
  rate       numeric(5,2) not null,
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vat_rates_country_rate_idx on vat_rates (country, rate);

insert into vat_rates (country, rate, note) values
  ('DE', 19, 'Germany standard'),
  ('DE',  7, 'Germany reduced'),
  ('DE',  0, 'Germany zero / exempt'),
  ('ES', 21, 'Spain standard'),
  ('ES', 10, 'Spain reduced'),
  ('ES',  4, 'Spain super-reduced')
on conflict (country, rate) do nothing;

commit;
