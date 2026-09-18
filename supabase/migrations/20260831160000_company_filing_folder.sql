begin;

alter table public.companies add column if not exists filing_folder text;

comment on column public.companies.filing_folder is
  'Dropbox folder this company''s documents are filed into, as a path under the app folder. '
  'Null means not configured, and nothing is filed on a guess.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_filing_folder_shape') then
    alter table public.companies add constraint companies_filing_folder_shape
      check (
        filing_folder is null
        or (
          btrim(filing_folder) = filing_folder
          and left(filing_folder, 1) = '/'
          and length(filing_folder) > 1
          and right(filing_folder, 1) <> '/'
          and filing_folder !~ '[[:cntrl:]]'
          and filing_folder not like '%//%'
        )
      );
  end if;
end $$;

create unique index if not exists companies_filing_folder_uniq
  on public.companies (lower(filing_folder))
  where filing_folder is not null and deleted_at is null;

commit;
