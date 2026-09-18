-- Closing either end of a match by hand.
--
-- WHY. A manual link allocates the smaller of the two open sides, which leaves a remainder on the
-- other. Two of those remainders are not really open:
--
--   the invoice   paid 45 cents short and nobody is chasing it (Skonto, a rounding difference,
--                 a bank fee taken off the transfer)
--   the payment   one transfer covering several invoices, and the last few euros belong to
--                 nothing -- or a customer overpaid and the surplus is not going to be matched
--
-- The invoice side already had somewhere to record this: `payment_tolerance` closes it when the
-- gap is small, and `difference_reason` (migration 20260910170000) says why. The PAYMENT side had
-- nothing at all, because sync_transaction_matching_status derives the status purely from
-- allocated amounts:
--
--   when v_alloc > 0 and v_alloc >= v_total - 0.01 then 'zugeordnet' else 'offen' end
--
-- So a transaction with 71,64 EUR unallocated is recomputed back to 'offen' the moment anything
-- touches it, whatever a screen was told. Marking it used has to be a FACT ON THE ROW, not a
-- status the trigger will overwrite on the next write.
--
-- WHAT THIS IS NOT. Not a way to make money disappear quietly: the columns record who decided and
-- why, the invoice history keeps its own entry, and both are reversible by clearing the stamp.
-- 'ignoriert' stays what it always was -- "no receipt is expected for this at all" -- which is a
-- different statement from "this payment is spent, the rest of it belongs to nobody".

begin;

alter table public.bank_transactions
  add column if not exists fully_used_at   timestamptz,
  add column if not exists fully_used_by   text,
  add column if not exists fully_used_note text;

comment on column public.bank_transactions.fully_used_at is
  'Set when somebody declared the transaction spent even though part of it is unallocated. '
  'Read by sync_transaction_matching_status, which would otherwise recompute it back to offen.';

-- The status derivation, now aware of the manual stamp. Everything else is unchanged from
-- migration 0058 -- including the 'ignoriert' guard, which still wins over both.
create or replace function public.sync_transaction_matching_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx    uuid := coalesce(new.transaction_id, old.transaction_id);
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = v_tx;
  if v_total is null then
    return null;
  end if;

  v_alloc := public.transaction_allocated_sum(v_tx) + public.outgoing_transaction_allocated_sum(v_tx);

  update public.bank_transactions t
     set matching_status = case
           -- A hand-closed transaction stays closed even with a remainder. It still has to carry
           -- at least one confirmed allocation: "fully used" describes what happened to a payment
           -- that paid something, not a way to file an untouched one away.
           when t.fully_used_at is not null and v_alloc > 0 then 'zugeordnet'
           when v_alloc > 0 and v_alloc >= v_total - 0.01 then 'zugeordnet'
           else 'offen'
         end
   where t.id = v_tx
     and t.matching_status <> 'ignoriert';

  return null;
end;
$$;

-- Stamping it. A security-definer RPC for the same reason link_invoice_transaction is one: the
-- client holds SELECT on bank_transactions and nothing more, and the rule "only a transaction that
-- has actually been allocated something" belongs next to the write rather than in a screen.
create or replace function public.set_transaction_fully_used(
  p_transaction_id uuid,
  p_note           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_alloc numeric;
begin
  if p_transaction_id is null then
    raise exception 'set_transaction_fully_used: transaction is required';
  end if;

  v_alloc := public.transaction_allocated_sum(p_transaction_id)
           + public.outgoing_transaction_allocated_sum(p_transaction_id);
  if coalesce(v_alloc, 0) <= 0 then
    raise exception
      'set_transaction_fully_used: nothing is allocated to this transaction yet'
      using errcode = 'check_violation';
  end if;

  update public.bank_transactions
     set fully_used_at   = now(),
         fully_used_by   = v_actor,
         fully_used_note = p_note,
         matching_status = case when matching_status = 'ignoriert' then matching_status
                                else 'zugeordnet' end
   where id = p_transaction_id;
end $$;

create or replace function public.clear_transaction_fully_used(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = p_transaction_id;
  v_alloc := public.transaction_allocated_sum(p_transaction_id)
           + public.outgoing_transaction_allocated_sum(p_transaction_id);

  update public.bank_transactions
     set fully_used_at   = null,
         fully_used_by   = null,
         fully_used_note = null,
         -- Back to what the amounts say, so undoing the stamp reopens the remainder.
         matching_status = case
           when matching_status = 'ignoriert' then matching_status
           when coalesce(v_alloc, 0) > 0 and v_alloc >= coalesce(v_total, 0) - 0.01 then 'zugeordnet'
           else 'offen'
         end
   where id = p_transaction_id;
end $$;

revoke execute on function public.set_transaction_fully_used(uuid, text) from anon, public;
revoke execute on function public.clear_transaction_fully_used(uuid) from anon, public;
grant execute on function public.set_transaction_fully_used(uuid, text) to authenticated;
grant execute on function public.clear_transaction_fully_used(uuid) to authenticated;

commit;
