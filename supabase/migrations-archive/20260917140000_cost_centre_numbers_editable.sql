-- 20260917140000_cost_centre_numbers_editable.sql
-- Let an admin maintain the cost-centre numbers in the Hub instead of asking us to.
--
-- WHY. The numbers were seeded from the tax adviser's workbook (20260911250000, 20260914130000) and
-- nothing could change them afterwards. A property the workbook does not list, Heddesheim
-- (HED-GÄ) at Stäy and at My Baufi, showed "Keine Kostenstelle hinterlegt" on its invoices, and
-- Saskia asked where to choose it (17.09.2026). The number is a fact about a property IN ONE
-- company's books, so it is set once on the property page, per company, and every invoice picks it
-- up. The overhead number is set once on the company.
--
-- WHO. Admins only, the same rule `companies` already has for every update. property_companies
-- lets any signed-in user change the property/company assignment (policy `using (true)`), and that
-- stays as it is, so the number gets its own guard: a trigger rather than a narrower update policy,
-- because the policy cannot tell which column changed. A wrong number reaches the tax adviser.
--
-- WHAT IS CHECKED. A number is positive, and no two live properties share one number inside the
-- same company. The same number in two companies is normal: each company numbers its own books.
-- Verified against live data before writing this: no duplicates, no non-positive values.

begin;

alter table public.property_companies
    drop constraint if exists property_companies_cost_center_number_positive;
alter table public.property_companies
    add constraint property_companies_cost_center_number_positive
    check (cost_center_number is null or cost_center_number > 0);

alter table public.companies
    drop constraint if exists companies_overhead_cost_center_positive;
alter table public.companies
    add constraint companies_overhead_cost_center_positive
    check (overhead_cost_center is null or overhead_cost_center > 0);

-- Unique among live assignments only: a removed assignment keeps its old number as history and must
-- not block the number being given to another property.
create unique index if not exists property_companies_company_cost_center_uniq
    on public.property_companies (company_id, cost_center_number)
    where deleted_at is null and cost_center_number is not null;

create or replace function public.guard_cost_center_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    -- auth.uid() is null for the service role and for migrations, which must keep working.
    if new.cost_center_number is distinct from old.cost_center_number
       and auth.uid() is not null
       and not public.is_admin() then
        raise exception 'Nur Administratoren dürfen Kostenstellen-Nummern ändern.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists property_companies_guard_cost_center_number on public.property_companies;
create trigger property_companies_guard_cost_center_number
    before update of cost_center_number on public.property_companies
    for each row execute function public.guard_cost_center_number();

commit;

notify pgrst, 'reload schema';
