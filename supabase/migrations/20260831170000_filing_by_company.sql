begin;

alter table public.companies rename column filing_folder to drive_folder_id;

alter table public.companies rename constraint companies_filing_folder_shape
  to companies_drive_folder_id_shape;

alter index if exists companies_filing_folder_uniq rename to companies_drive_folder_id_uniq;

alter table public.properties add column if not exists drive_folder_id text;

comment on column public.companies.drive_folder_id is
  'Dropbox folder this company''s documents are filed into, as a path under the app folder. Read '
  'by the shared pipeline''s entity_folder_for_item(). Null means not configured, and nothing is '
  'filed on a guess.';

comment on column public.properties.drive_folder_id is
  'Dropbox folder this property''s documents are filed into. Same contract as the company column.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_drive_folder_id_shape') then
    alter table public.properties add constraint properties_drive_folder_id_shape
      check (
        drive_folder_id is null
        or (
          btrim(drive_folder_id) = drive_folder_id
          and left(drive_folder_id, 1) = '/'
          and length(drive_folder_id) > 1
          and right(drive_folder_id, 1) <> '/'
          and drive_folder_id !~ '[[:cntrl:]]'
          and drive_folder_id not like '%//%'
        )
      );
  end if;
end $$;

create unique index if not exists properties_drive_folder_id_uniq
  on public.properties (lower(drive_folder_id))
  where drive_folder_id is not null and deleted_at is null;

create table if not exists public.filing_placements (
  id              uuid primary key default gen_random_uuid(),
  channel         text        not null,
  workflow_status text        not null,
  folder_id       text        not null,
  folder_label    text,
  month_partition boolean     not null default false,
  routing         text        not null default 'fixed',
  is_active       boolean     not null default true,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text,

  constraint filing_placements_channel_chk
    check (channel in ('scan_folder', 'mailbox')),

  constraint filing_placements_status_chk
    check (workflow_status in (
      'eingegangen', 'in_pruefung', 'rueckfrage',
      'freigegeben_assistenz', 'freigegeben_vorgesetzter',
      'bezahlt', 'uebergeben_datev', 'abgeschlossen',
      'abgelehnt', 'nicht_relevant'
    )),

  constraint filing_placements_routing_chk
    check (routing in ('fixed', 'company', 'property')),

  constraint filing_placements_routing_month_chk
    check (routing = 'fixed' or not month_partition)
);

create unique index if not exists filing_placements_channel_status_uniq
  on public.filing_placements (channel, workflow_status)
  where is_active;

alter table public.filing_placements enable row level security;

drop policy if exists filing_placements_read on public.filing_placements;
create policy filing_placements_read on public.filing_placements
  for select to authenticated using (true);

drop policy if exists filing_placements_write on public.filing_placements;
create policy filing_placements_write on public.filing_placements
  for all to authenticated
  using (public.has_permission('postfach.settings'))
  with check (public.has_permission('postfach.settings'));

commit;
