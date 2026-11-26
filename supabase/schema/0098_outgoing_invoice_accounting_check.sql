-- A check by accounting between an outgoing invoice being created and it being pushed to
-- Lexware. Off by default: require_accounting_check stays false until an administrator turns it
-- on in Invoice settings, so an existing client's Hub does not change under them.

begin;

alter table public.invoice_settings
    add column if not exists require_accounting_check boolean not null default false;

alter table public.outgoing_invoices
    add column if not exists accounting_checked_at timestamptz,
    add column if not exists accounting_checked_by text;

comment on column public.invoice_settings.require_accounting_check is
    'Off: invoices go to Lexware as soon as they are created. On: someone must confirm accounting_checked_at first.';

-- 0037_lexoffice_invoice_auto_push.sql pushes a new commission invoice to Lexware the moment it is
-- inserted. require_accounting_check needs that push held until accounting_checked_at is set, so
-- the check itself is now the gate: the insert trigger skips while a check is outstanding, and a
-- second trigger fires the same push once accounting_checked_at is first set.
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
