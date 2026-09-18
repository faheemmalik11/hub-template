-- 0004 — properties (properties/projects) table + invoices.property_id FK.
--
-- Mirrors the companies/company setup for properties: a canonical objekt has a code, name,
-- address, the owning company, and a VAT status. invoices gets an property_id FK so invoices can be
-- linked to a real property (today only free-text invoices.property_code exists).
--
-- Additive + idempotent + transactional: creates an EMPTY table and a NULLABLE FK column — no
-- existing row is touched. Property rows + their name variants (entity_aliases, entity_type='objekt')
-- are seeded later from the master list (Philipp/Anja); until then objekt resolution matches nothing.

begin;

create table if not exists public.properties (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text,
  address         text,
  company_id uuid references public.companies(id),
  vat_status      text,                 -- VAT status of the property (e.g. steuerpflichtig/steuerfrei/gemischt)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.invoices add column if not exists property_id uuid references public.properties(id);

commit;

-- Sanity (after applying): \d public.properties  and  select count(*) from properties;  -- expect 0 rows initially.
