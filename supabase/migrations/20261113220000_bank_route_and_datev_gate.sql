begin;

CREATE OR REPLACE FUNCTION public.set_bank_account_connect_route() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.provider_ref is null then
    new.connect_route := coalesce(new.connect_route, 'ebics_or_manual');
  else
    select case when p.is_supported then 'banksapi' else 'ebics_or_manual' end
      into new.connect_route
      from bank_providers p where p.provider_ref = new.provider_ref;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.set_datev_route(p_company_id uuid, p_direction text, p_address text, p_is_enabled boolean, p_note text, p_updated_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Must come BEFORE has_company_access(): that function answers true for an anonymous caller.
  if auth.uid() is null then
    raise exception 'set_datev_route: authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.may_write('rules.write') then
    raise exception 'set_datev_route: rules.write required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_company_access(p_company_id) then
    raise exception 'set_datev_route: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  insert into public.handover_routes (company_id, direction, address, is_enabled, note, updated_by, updated_at)
  values (p_company_id, p_direction, p_address, p_is_enabled, p_note, p_updated_by, now())
  on conflict (company_id, direction) do update set
    address    = excluded.address,
    is_enabled = excluded.is_enabled,
    note       = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

CREATE OR REPLACE FUNCTION public.update_datev_route_status(p_id uuid, p_is_enabled boolean, p_note text, p_updated_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'update_datev_route_status: authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.may_write('rules.write') then
    raise exception 'update_datev_route_status: rules.write required' using errcode = 'insufficient_privilege';
  end if;

  select company_id into v_company from public.handover_routes where id = p_id;
  if v_company is null then
    raise exception 'update_datev_route_status: route % not found', p_id;
  end if;
  if not public.has_company_access(v_company) then
    raise exception 'update_datev_route_status: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  update public.handover_routes
     set is_enabled = p_is_enabled, note = p_note, updated_by = p_updated_by, updated_at = now()
   where id = p_id;
end;
$$;

commit;
