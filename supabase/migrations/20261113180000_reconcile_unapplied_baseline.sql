begin;

alter table public.outgoing_invoices
    add column if not exists lexoffice_sync_requested_at timestamptz;

alter table public.documents
    add column if not exists lexoffice_open_amount numeric(14, 2);

alter table public.suppliers
    add column if not exists trade text;

CREATE OR REPLACE FUNCTION public.team_login_status() RETURNS TABLE(user_id uuid, last_sign_in_at timestamptz, never_signed_in boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select a.id, u.last_sign_in_at, u.last_sign_in_at is null
    from public.app_users a
    left join auth.users u on u.id = a.auth_user_id
   where public.is_admin();
$$;

revoke execute on function public.team_login_status() from public;
revoke execute on function public.team_login_status() from anon;
grant execute on function public.team_login_status() to authenticated;

commit;
