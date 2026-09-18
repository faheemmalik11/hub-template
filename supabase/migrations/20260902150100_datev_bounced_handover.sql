-- 20260902150100_datev_bounced_handover.sql
-- Make a misdelivered DATEV handover visible. Ported from Mayestate's
-- 20260821140000_datev_bounced_handover.sql, with one deliberate difference (see "Who may
-- acknowledge" below).
--
-- What was already covered: a send that fails outright is recorded as status 'error' with its
-- message, and the send path cannot reach the wrong company because it selects invoices by
-- company_id and reads that same company's route. A route that is switched off is refused before
-- anything is sent.
--
-- What was not: the mail leaves, Gmail accepts it, and the non-delivery report arrives minutes
-- later. The batch stays 'success' for ever and the receipts stay marked as handed over, while the
-- tax advisor never received them. There is no return channel from DATEV, so nothing else in the
-- system will ever notice.
--
-- Two decisions worth stating, because both are reversible only with effort:
--
--   1. A bounce CLEARS datev_handed_over_at on the batch's invoices. If DATEV never received a
--      receipt it has not been handed over, so it must reappear on the ready list rather than sit
--      silently ticked off. datev_batch_id is deliberately kept, so the failed attempt stays
--      traceable from the invoice.
--   2. The reason is stored verbatim. A non-delivery report names the address it could not reach,
--      which is exactly what somebody diagnosing a wrong address needs, so it is not summarised.
--
-- Who writes it: the ingestion pipeline, which already reads the mailbox the reports arrive in.
-- It calls the RPC below rather than updating the table, so the invoice reset and the batch update
-- cannot drift apart. NOTE FOR IMMONETZ: the pipeline stage exists and already supports Gmail
-- (`datev_bounce` in ai-mail-extraction), but this tenant does not list it yet -- see
-- docs/DATEV_HANDOVER.md. Until it does, this migration is correct and simply never fires.

begin;

alter table public.datev_handover_batches drop constraint if exists datev_handover_batches_status_check;
alter table public.datev_handover_batches
  add constraint datev_handover_batches_status_check
  check (status in ('success', 'error', 'bounced'));

alter table public.datev_handover_batches add column if not exists bounced_at timestamptz;
alter table public.datev_handover_batches add column if not exists bounce_reason text;
alter table public.datev_handover_batches add column if not exists acknowledged_at timestamptz;
alter table public.datev_handover_batches add column if not exists acknowledged_by text;

comment on column public.datev_handover_batches.bounce_reason is
  'The non-delivery report verbatim. It names the address that could not be reached, which is what '
  'diagnosing a wrong DATEV address needs.';
comment on column public.datev_handover_batches.acknowledged_at is
  'Set when somebody has dealt with the bounce. Until then the batch stays on the screen: a '
  'misdelivery nobody has seen is the failure mode this column exists to prevent.';

-- The screen asks one question ("what needs attention?"), so the index answers exactly that.
create index if not exists datev_handover_batches_open_bounce_idx
  on public.datev_handover_batches (created_at desc)
  where status = 'bounced' and acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- Marking a bounce. One entry point, so the batch and its invoices cannot disagree.
-- ---------------------------------------------------------------------------
create or replace function public.mark_datev_batch_bounced(
  p_batch_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_reset  int;
begin
  select status into v_status
    from public.datev_handover_batches
   where id = p_batch_id
   for update;

  if v_status is null then
    raise exception 'mark_datev_batch_bounced: no batch %', p_batch_id;
  end if;

  -- Idempotent: a mailbox read that sees the same report twice must not undo an acknowledgement.
  if v_status = 'bounced' then
    return;
  end if;

  update public.datev_handover_batches
     set status        = 'bounced',
         bounced_at    = now(),
         bounce_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_batch_id;

  -- Not handed over after all, so it goes back on the ready list. datev_batch_id stays, so the
  -- failed attempt is still traceable from the receipt.
  update public.invoices
     set datev_handed_over_at = null
   where datev_batch_id = p_batch_id
     and datev_handed_over_at is not null;
  get diagnostics v_reset = row_count;

  raise notice 'batch % marked bounced, % invoice(s) returned to the ready list', p_batch_id, v_reset;
end;
$$;

revoke all on function public.mark_datev_batch_bounced(uuid, text) from public;
revoke all on function public.mark_datev_batch_bounced(uuid, text) from anon;
grant execute on function public.mark_datev_batch_bounced(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Acknowledging one.
--
-- WHO MAY ACKNOWLEDGE, and why this differs from the Mayestate original. That version gates on
-- is_admin(). This Hub deliberately does not: the 2026-08-15 access review settled that DATEV
-- handover here is scoped by COMPANY and not by role ("assistants do hand over, scoped to the
-- companies they have access to"), and both route RPCs were rewritten to has_company_access() for
-- exactly that reason. Someone trusted to send a company's receipts is the same person who should
-- be able to clear the bounce when that send failed, so gating the cleanup on a stricter rule than
-- the send would leave the person who caused it unable to close it.
--
-- The auth.uid() check must come FIRST. has_company_access() answers TRUE for a caller with no JWT
-- (its "no grants recorded means unrestricted" branch matches an anonymous caller trivially), which
-- is safe inside an RLS policy scoped `to authenticated` and NOT safe as the sole gate in a
-- SECURITY DEFINER function. See 20260815220000_datev_route_deny_anonymous.sql, which is the
-- migration that exists because this was got wrong once already.
-- ---------------------------------------------------------------------------
create or replace function public.acknowledge_datev_batch(
  p_batch_id uuid,
  p_actor    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'acknowledge_datev_batch: authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  select company_id into v_company
    from public.datev_handover_batches
   where id = p_batch_id;

  if v_company is null then
    raise exception 'acknowledge_datev_batch: no batch %', p_batch_id;
  end if;

  if not public.has_company_access(v_company) then
    raise exception 'acknowledge_datev_batch: no access to this company'
      using errcode = 'insufficient_privilege';
  end if;

  update public.datev_handover_batches
     set acknowledged_at = now(),
         acknowledged_by = nullif(btrim(coalesce(p_actor, '')), '')
   where id = p_batch_id
     and status = 'bounced'
     and acknowledged_at is null;
end;
$$;

revoke all on function public.acknowledge_datev_batch(uuid, text) from public;
revoke all on function public.acknowledge_datev_batch(uuid, text) from anon;
grant execute on function public.acknowledge_datev_batch(uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check. Probes the catalog rather than switching role, for the reason 0038's own checks give.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text[] := '{}';
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'datev_handover_batches'
                    and column_name = 'bounce_reason') then
    v_missing := v_missing || 'datev_handover_batches.bounce_reason';
  end if;
  if to_regprocedure('public.mark_datev_batch_bounced(uuid, text)') is null then
    v_missing := v_missing || 'mark_datev_batch_bounced';
  end if;
  if to_regprocedure('public.acknowledge_datev_batch(uuid, text)') is null then
    v_missing := v_missing || 'acknowledge_datev_batch';
  end if;
  -- PUBLIC must not hold EXECUTE on either: a `create or replace` re-applies Supabase's default
  -- grants, so this is the check that catches a future edit undoing the revokes above.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('mark_datev_batch_bounced', 'acknowledge_datev_batch')
       and array_to_string(p.proacl, ',') like '=X/%'
  ) then
    v_missing := v_missing || 'PUBLIC still holds EXECUTE';
  end if;
  if array_length(v_missing, 1) is not null then
    raise exception 'datev bounce self-check FAILED, missing: %', array_to_string(v_missing, ', ');
  end if;
  raise notice 'datev bounce ok: status widened, columns, index and both functions in place';
end $$;
