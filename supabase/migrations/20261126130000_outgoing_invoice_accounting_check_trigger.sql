begin;

create or replace function public.lexoffice_invoice_push_now() returns trigger
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_key text;
  v_url text;
  v_require_check boolean;
begin
  select require_accounting_check into v_require_check from public.invoice_settings where id = true;
  if coalesce(v_require_check, false) and new.accounting_checked_at is null then
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

drop trigger if exists outgoing_invoices_lexoffice_push_after_check on public.outgoing_invoices;
create trigger outgoing_invoices_lexoffice_push_after_check after update on public.outgoing_invoices
    for each row
    when (new.source = 'app' and new.kind = 'commission'
          and new.accounting_checked_at is not null and old.accounting_checked_at is null)
    execute function public.lexoffice_invoice_push_now();

commit;
