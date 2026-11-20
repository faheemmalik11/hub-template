-- bonus_settings is a singleton (single_row boolean primary key default true check (single_row)),
-- so correcting the one existing row alongside the default is safe and keeps every deployment that
-- ever runs this schema in the right state, not only the one caught with the wrong value today.

begin;

alter table public.bonus_settings alter column company_lead_deducts_costs set default false;

update public.bonus_settings
   set company_lead_deducts_costs = false
 where company_lead_deducts_costs;

commit;
