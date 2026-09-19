-- 20260817150000_property_code_rename_cascade.sql
-- The property-side twin of 20260817140000_company_code_rename_cascade.sql.
--
-- `properties.code` is used as a plain-text key in exactly the same way `companies.code` was, so
-- renaming a property silently orphans everything keyed to the old string:
--
--   entity_aliases.entity_code  (where entity_type = 'objekt')  -- how the ingest pipeline resolves
--                                                                  a property name found on a document
--   invoices.property_code                                      -- a denormalised copy, not a foreign key
--
-- Nothing cascades either of them today. The company version of this bug was reproduced end to end
-- through the UI on the Immonetz DEV project (rename -> alias list went 1 -> 0, invoice mismatches
-- went 0 -> 10, and reusing the freed code surfaced another legal entity's documents). The property
-- version has the identical shape and a larger blast radius: 55 objekt aliases on Immonetz DEV, 67
-- on Stäy, 260 on Eiffler.
--
-- One difference worth recording. The Objekte detail screen does NOT expose `code` in its edit form
-- (it edits name, address, vat_status, drive_folder_url, ownership_type), so this cannot currently
-- be triggered by a user click the way the company rename could. It is still worth fixing at the
-- database level rather than in the mutation hook, for the same reason as the company trigger:
-- `useUpdateObjekt` writes whatever `Partial<Objekt>` it is handed, the ingest pipeline writes to
-- this table directly, and codes do get corrected by hand in SQL. A guarantee that only holds as
-- long as nobody adds a `code` field to a form is not a guarantee.

begin;

create or replace function public.cascade_property_code_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Scoped to 'objekt' so a company or supplier alias that happens to share the string is untouched.
  update public.entity_aliases
     set entity_code = new.code
   where entity_type = 'objekt'
     and entity_code = old.code;

  -- invoices.property_code is a denormalised copy of the code, with no foreign key behind it. Unlike
  -- the company cascade there is no id column on invoices to disambiguate with, so every row holding
  -- the old code follows the rename. That is the correct reading: the code moved to this property,
  -- so references to it move too, and leaving them behind would point at a property that no longer
  -- exists under that name.
  update public.invoices
     set property_code = new.code
   where property_code = old.code;

  return new;
end;
$function$;

drop trigger if exists properties_code_rename_cascade on public.properties;

create trigger properties_code_rename_cascade
  after update of code on public.properties
  for each row
  when (old.code is distinct from new.code)
  execute function public.cascade_property_code_rename();

commit;

-- Sanity (after applying):
--   select tgname from pg_trigger where tgrelid = 'public.properties'::regclass and not tgisinternal;
--   -- expect properties_code_rename_cascade
--
-- End-to-end, on a throwaway code (pick one that actually has aliases):
--   update public.properties set code = 'ZZTEST' where code = '<some code>';
--   select count(*) from public.entity_aliases
--    where entity_type = 'objekt' and entity_code = '<some code>';   -- expect 0
--   select count(*) from public.invoices where property_code = '<some code>';  -- expect 0
--   update public.properties set code = '<some code>' where code = 'ZZTEST';   -- and back
