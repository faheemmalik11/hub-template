-- 0010_company_vat_assignment — Company & VAT assignment via the business-line model.
--
-- WHY: today a receipt's company is guessed from the recipient NAME alone
-- (resolve_codes.resolve_from_felder → empfaenger_name vs. the alias table). A name cannot tell
-- which company a property belongs to, nor how VAT applies. On dev this leaves ~41% of invoices with
-- no company and produces wrong ones (e.g. GRSC12→IMKO although property_assignment says GRSC12/LTR
-- →IMGM). The authoritative model already exists (business_line + property_assignment, 0006/0007) but
-- is never consulted. From now on company + VAT are derived via property × business line → company
-- (Briefing Part 1 / Screens 2,3,5), and the receipt records which business line / VAT treatment it
-- landed in.
--
-- This migration adds:
--   1. A catch-all owner company "Nicht zugeordnet" (code NZO). Whatever cannot be resolved is
--      assigned to NZO (+ status zu_pruefen in code) instead of company_id=NULL, so it stays a
--      VISIBLE, filterable bucket in every company-grouped evaluation (Briefing A3: "must be visible,
--      otherwise amounts disappear silently"). NZO is a system bucket, never matched FROM a receipt
--      (it is intentionally NOT added to entity_aliases and is excluded from the resolver).
--   2. invoices.vat_treatment / business_line_id / business_line_code / assignment_source — the
--      derived VAT treatment (steuerpflichtig|steuerfrei|gemischt|unbekannt; no CHECK so 'unbekannt'
--      is allowed), the resolved business line, and HOW the company was resolved
--      (property_assignment | property_assignment+name | name | unresolved).
--
-- Additive + idempotent. Apply with:
--   python3 pipeline/apply_migration.py supabase/migrations/0010_company_vat_assignment.sql

begin;

-- 1. Catch-all owner. Seeded like the six real companies (companies table has code UNIQUE).
insert into public.companies (code, name) values
  ('NZO', 'Nicht zugeordnet')
on conflict (code) do nothing;

-- 2. Derived assignment columns on the receipt.
alter table public.invoices add column if not exists vat_treatment      text;
alter table public.invoices add column if not exists business_line_id   uuid references public.business_line(id);
alter table public.invoices add column if not exists business_line_code text;
alter table public.invoices add column if not exists assignment_source  text;
create index if not exists invoices_business_line_idx on public.invoices (business_line_id);

commit;

-- Sanity:
--   select code, name from public.companies where code='NZO';  -- expect the catch-all row
--   \d public.invoices  -- expect vat_treatment, business_line_id (FK->business_line.id),
--                       --        business_line_code, assignment_source
