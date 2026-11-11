begin;

alter table public.documents
    add column if not exists accounting_external_id text,
    add column if not exists lexoffice_sync_requested_at timestamptz,
    add column if not exists lexoffice_sync_error text;

create unique index if not exists documents_accounting_external_id
    on public.documents (accounting_external_id)
    where accounting_external_id is not null and deleted_at is null;

alter table public.suppliers
    add column if not exists accounting_external_id text;

create unique index if not exists suppliers_accounting_external_id
    on public.suppliers (accounting_external_id)
    where accounting_external_id is not null and deleted_at is null;

alter table public.categories
    add column if not exists lexware_category_id text;

create or replace function public.lexoffice_document_push_now() returns trigger
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_key text;
  v_url text;
begin
  v_key := public.deployment_secret('service_role_key');
  v_url := public.deployment_secret('project_url');
  if v_key is null or v_url is null then
    return null;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/lexoffice-document-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('document_id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end;
$$;

drop trigger if exists documents_lexoffice_push_insert on public.documents;
create trigger documents_lexoffice_push_insert after insert on public.documents
    for each row
    when (new.workflow_status in ('approved_final', 'paid'))
    execute function public.lexoffice_document_push_now();

drop trigger if exists documents_lexoffice_push_update on public.documents;
create trigger documents_lexoffice_push_update after update of workflow_status on public.documents
    for each row
    when (new.workflow_status in ('approved_final', 'paid')
        and old.workflow_status is distinct from new.workflow_status)
    execute function public.lexoffice_document_push_now();

commit;
