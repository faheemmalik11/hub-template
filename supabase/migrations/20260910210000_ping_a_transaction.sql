-- Ping somebody about a BANK TRANSACTION, not only about an invoice.
--
-- WHY. From the 09.09.2026 meeting, Saskia describing what Petra does today when a payment has no
-- document [19:20]: "she has to request it from somebody. Either she could tag someone directly
-- and say, for example, Saskia probably has this one and forgot to forward it again. Or, what she
-- does today, she makes a list. But then she has to maintain that list manually and write down
-- every missing item. That's exactly what we want to avoid."
--
-- The ping already exists and is the right shape -- one person, one note, straight into their
-- bell. It just could not point at a transaction, so the case Petra actually has (a payment with
-- no invoice behind it) was the one it could not express.
--
-- DELIBERATELY NOT AN ASSIGNMENT. bank_transactions has no assignee and this does not add one: a
-- ping is a message, not ownership. Nobody "holds" the transaction afterwards and there is no
-- second state to clear later, which is what makes it match the list Petra is trying to stop
-- keeping rather than replacing it with a different list.
--
-- The old three-argument signature is dropped rather than left beside this one: PostgREST resolves
-- overloads by argument names, and two functions differing only by a defaulted parameter answer
-- the same call ambiguously ("function is not unique").

begin;

drop function if exists public.request_approval_ping(uuid, uuid, text);

create or replace function public.request_approval_ping(
  p_recipient uuid,
  p_invoice_id uuid default null,
  p_note text default null,
  p_transaction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := public.current_app_user_id();
  v_sender_name text;
begin
  if v_sender is null then
    raise exception 'request_approval_ping: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;
  if p_recipient is null then
    raise exception 'request_approval_ping: recipient is required';
  end if;

  -- YOURSELF IS NOT A RECIPIENT. A ping is how you ask somebody else to look at something; sent to
  -- your own account it produces a bell entry addressed by you, to you, about a thing you are
  -- already looking at. The screen filters itself out of the list too, so reaching this is either
  -- a stale page or a direct call.
  if p_recipient = v_sender then
    raise exception 'request_approval_ping: cannot ping yourself'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.app_users where id = p_recipient and is_active) then
    raise exception 'request_approval_ping: recipient % is not an active user', p_recipient;
  end if;
  if p_invoice_id is not null
     and not exists (select 1 from public.invoices where id = p_invoice_id) then
    raise exception 'request_approval_ping: invoice % does not exist', p_invoice_id;
  end if;
  if p_transaction_id is not null
     and not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'request_approval_ping: transaction % does not exist', p_transaction_id;
  end if;

  select name into v_sender_name from public.app_users where id = v_sender;

  -- jsonb_strip_nulls keeps the payload to what is actually referenced, so a reader (and the bell)
  -- can tell an invoice ping from a transaction ping by which key is present.
  insert into public.notification_events (type, payload, recipient_user_id, created_by)
  values (
    'ping',
    jsonb_strip_nulls(jsonb_build_object(
      'invoice_id', p_invoice_id,
      'transaction_id', p_transaction_id,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'from_name', v_sender_name
    )),
    p_recipient,
    v_sender
  );
end;
$$;

revoke execute on function public.request_approval_ping(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.request_approval_ping(uuid, uuid, text, uuid) to authenticated;

commit;
