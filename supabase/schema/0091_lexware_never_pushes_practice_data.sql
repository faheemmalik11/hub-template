begin;

drop trigger if exists documents_lexoffice_push_insert on public.documents;
create trigger documents_lexoffice_push_insert after insert on public.documents
    for each row
    when (new.workflow_status in ('approved_final', 'paid')
        and coalesce(new.is_demo, false) = false)
    execute function public.lexoffice_document_push_now();

drop trigger if exists documents_lexoffice_push_update on public.documents;
create trigger documents_lexoffice_push_update after update of workflow_status on public.documents
    for each row
    when (new.workflow_status in ('approved_final', 'paid')
        and old.workflow_status is distinct from new.workflow_status
        and coalesce(new.is_demo, false) = false)
    execute function public.lexoffice_document_push_now();

create or replace function public.lexoffice_invoice_push_now() returns trigger
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_key text;
  v_url text;
begin
  if exists (
    select 1
      from public.deals d
      join public.properties p on p.id = d.property_id
     where d.id = new.deal_id and p.is_demo
  ) then
    return null;
  end if;

  v_key := public.deployment_secret('service_role_key');
  v_url := public.deployment_secret('project_url');
  if v_key is null or v_url is null then
    return null;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/lexoffice-invoice-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('outgoing_invoice_id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end;
$$;

commit;
