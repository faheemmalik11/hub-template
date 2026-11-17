begin;

create or replace function public.lexoffice_invoice_push_now() returns trigger
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_key text;
  v_url text;
  v_is_demo boolean;
begin
  -- A practice deal's invoice must never reach the client's real Lexware account.
  select p.is_demo into v_is_demo
    from public.deals d join public.properties p on p.id = d.property_id
   where d.id = new.deal_id;
  if v_is_demo then
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
