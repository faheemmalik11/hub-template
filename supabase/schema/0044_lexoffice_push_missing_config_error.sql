begin;

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
    update public.documents
       set lexoffice_sync_error = 'Lexware handover is not set up on this deployment yet: '
         || 'project_url/service_role_key are missing from the vault.'
     where id = new.id;
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

commit;
