-- 20260917150000_cost_centre_number_insert_guard.sql
-- The cost-centre number is admin-only on INSERT too, not only on UPDATE.
--
-- WHY. 20260917140000 guarded `update of cost_center_number`. The property page now adds a company
-- and its number in one step, from a modal (17.09.2026), which is an INSERT carrying the number, and
-- that path was open to any signed-in user. Assigning a property to a company stays open to everyone
-- (policy `with check (true)`); only a number arriving with it is refused for a non-admin.

begin;

create or replace function public.guard_cost_center_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    -- auth.uid() is null for the service role and for migrations, which must keep working.
    if auth.uid() is null or public.is_admin() then
        return new;
    end if;
    if (tg_op = 'INSERT' and new.cost_center_number is not null)
       or (tg_op = 'UPDATE' and new.cost_center_number is distinct from old.cost_center_number) then
        raise exception 'Nur Administratoren dürfen Kostenstellen-Nummern ändern.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists property_companies_guard_cost_center_number on public.property_companies;
create trigger property_companies_guard_cost_center_number
    before insert or update of cost_center_number on public.property_companies
    for each row execute function public.guard_cost_center_number();

commit;
