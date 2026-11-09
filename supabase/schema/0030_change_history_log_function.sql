-- `change_history` is readable by whoever may read the thing it is about, and written by nobody
-- directly (see 0010_access.sql) -- a raw client insert is rejected by RLS, on purpose: the audit
-- trail stays authoritative only if nothing can fabricate an entry attributing arbitrary text to
-- arbitrary data. `insertChangeHistory()` in src/data/client.ts was written assuming a direct
-- insert would work and has been failing silently on every call since the table existed: the
-- underlying write (e.g. a role permission grant) succeeds, the change_history insert after it is
-- rejected, the whole mutation throws, and the screen never learns the real write went through.
--
-- log_change_history() is the trusted path that policy was always meant to require: it derives the
-- actor itself from the caller's own session, the same way every other security definer writer in
-- this schema does, rather than trusting a client-supplied value.

begin;

create or replace function public.log_change_history(
    p_table_name text,
    p_record_id uuid,
    p_type text,
    p_text text,
    p_data jsonb default null
) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
begin
  insert into public.change_history (table_name, record_id, type, text, data, actor, at)
  values (p_table_name, p_record_id, p_type, p_text, p_data, v_actor, now());
end;
$$;

revoke all on function public.log_change_history(text, uuid, text, text, jsonb) from public, anon;
grant execute on function public.log_change_history(text, uuid, text, text, jsonb) to authenticated;

commit;
