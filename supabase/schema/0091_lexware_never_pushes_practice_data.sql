-- Three triggers push to the client's real Lexware account, and none of them asked whether the row
-- was practice data:
--   documents_lexoffice_push_insert / _update  fire the moment workflow_status reaches
--     approved_final or paid. The stop-cases practice starts its three invoices at 'received', so
--     approving one during the exercise sent a practice document to the real accounts.
--   outgoing_invoices_lexoffice_push           fires on every commission invoice the app writes,
--     including the ones the commission practice creates.
-- A Lexware invoice cannot be deleted once it exists, only voided, so this is not a tidy-up job
-- afterwards -- it has to not happen.
--
-- documents carries is_demo, so those two can refuse in the trigger's own WHEN clause. Neither
-- outgoing_invoices nor deals has the column: a commission invoice is practice data because the
-- deal's property is, which needs a lookup, and a WHEN clause cannot do one -- so that guard sits
-- at the top of the function instead.

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
