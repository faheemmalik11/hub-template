-- A private-held document gets an owner, so it is readable by that one person and an administrator
-- and nobody else who merely holds documents.read; a document also learns whether it is an invoice,
-- for the KPI that only counts invoices as needing action; and document_history becomes
-- tamper-proof once written. Paste into the Supabase SQL editor as the database owner; safe to run
-- twice.
--
-- Includes the RLS policies behind "private", not only the column: without them
-- private_owner_user_id enforces nothing, and anybody holding documents.read can still read a
-- private row straight by id. Skip the two "private_hold" policy blocks below if that enforcement
-- is not wanted yet.
--
-- outgoing_invoices: this repo's code expects a column named last_sync_at; this client's live
-- database has it as last_synced_at. Not renamed by this file -- a human has to pick a side.
--
-- is_invoice ships NULL with no backfill (document_type here is free text, not an enum, so this
-- file cannot guess which old rows are invoices). Until the pipeline starts setting it or a human
-- backfills it, invoice_queue_kpis()'s needs_action count below will read 0 for existing documents.

begin;

alter table public.documents add column if not exists private_owner_user_id uuid references public.app_users(id) on delete set null;
create index if not exists documents_private_owner_idx on public.documents (private_owner_user_id) where private_hold;

alter table public.documents add column if not exists is_invoice boolean;
alter table public.documents add column if not exists document_type_source text;
alter table public.documents add column if not exists is_invoice_source text;

create or replace function public.document_is_countable(p_status text, p_private_hold boolean) returns boolean
language sql immutable set search_path to 'public'
as $$
  select p_status is distinct from 'duplicate' and not coalesce(p_private_hold, false);
$$;

-- document_history is the audit trail a person reads on the detail screen, so once a row is
-- written it has to stay exactly as written. INSERT is still open to anyone the area policy already
-- lets write; UPDATE, DELETE and TRUNCATE are refused unconditionally, for every role including the
-- pipeline's own service role, which is why this is a trigger and not only the grant revoked beside
-- it. actor/created_at are stamped here rather than trusted from the caller only for
-- authenticated/anon: a client role could otherwise write history under somebody else's name or
-- backdate it; the pipeline's own service-role writes keep the timestamp it sends.
create or replace function public.guard_document_history_immutable() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.actor := auth.jwt() ->> 'email';
      new.created_at := now();
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    raise exception 'document_history rows cannot be changed' using errcode = '42501';
  elsif tg_op = 'DELETE' then
    raise exception 'document_history rows cannot be deleted' using errcode = '42501';
  end if;
  raise exception 'document_history cannot be truncated' using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_document_history_row on public.document_history;
create trigger trg_guard_document_history_row
  before insert or update or delete on public.document_history
  for each row execute function public.guard_document_history_immutable();

drop trigger if exists trg_guard_document_history_truncate on public.document_history;
create trigger trg_guard_document_history_truncate
  before truncate on public.document_history
  for each statement execute function public.guard_document_history_immutable();

-- Private post: mail the pipeline never files into a company folder because it belongs to a person,
-- not the business. Restrictive, so it narrows what the area policies already allow rather than
-- granting anything on its own -- a person with no documents.read grant still sees nothing here
-- either way. An administering role always sees it; the person it was assigned to
-- (private_owner_user_id) sees that one row once an admin has made the assignment. Nobody else,
-- regardless of capability.
drop policy if exists documents_private_hold_read on public.documents;
create policy documents_private_hold_read on public.documents as restrictive for select to authenticated
    using (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id());
drop policy if exists documents_private_hold_write on public.documents;
create policy documents_private_hold_write on public.documents as restrictive for insert to authenticated
    with check (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id());
drop policy if exists documents_private_hold_write_update on public.documents;
create policy documents_private_hold_write_update on public.documents as restrictive for update to authenticated
    using (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id())
    with check (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id());

-- Everything that hangs off a document follows the document's own visibility. Without this, a
-- private row stayed hidden itself but its files, history, line items, taxes, bank accounts, bank
-- matches, import log and processing log were still readable sideways by document_id, through their
-- own capability-scoped policy alone.
do $$
declare
    t text;
begin
    foreach t in array array['document_files', 'document_history', 'document_line_items',
                              'document_taxes', 'document_bank_accounts',
                              'document_transaction_matches', 'imported_items', 'processing_log',
                              'ai_usage', 'payment_orders'] loop
        execute format('drop policy if exists %I on public.%I', t || '_private_hold_read', t);
        execute format(
            'create policy %I on public.%I as restrictive for select to authenticated using ('
            || '%I.document_id is null or not exists ('
            || 'select 1 from public.documents d where d.id = %I.document_id and d.private_hold '
            || 'and not (public.is_admin() or d.private_owner_user_id = public.current_app_user_id())))',
            t || '_private_hold_read', t, t, t);
    end loop;
end
$$;

-- document_history additionally has to refuse WRITING a row against a private document the caller
-- may not read, the same way documents_private_hold_write guards the document itself.
drop policy if exists document_history_private_hold_write on public.document_history;
create policy document_history_private_hold_write on public.document_history as restrictive for insert to authenticated
    with check (
        not exists (
            select 1 from public.documents d
             where d.id = document_history.document_id and d.private_hold
               and not (public.is_admin() or d.private_owner_user_id = public.current_app_user_id())
        )
    );

-- The trail is written once and never changed, so a client role cannot rewrite its own history
-- after the fact even through a capability it otherwise holds. See guard_document_history_immutable
-- above for the trigger that blocks UPDATE/DELETE/TRUNCATE for every role, including this one's own
-- service role; the revoke below is the belt to that trigger's suspenders.
revoke update, delete, truncate on public.document_history from authenticated, anon;

commit;

-- What a person sees in a list of documents: the row, who it is filed under for sorting, how badly
-- it needs attention, and whether the bank already agrees with it. A private-held document is
-- dropped from this list for everyone -- it is read through its own screen, not the general one.
begin;

create or replace view public.v_documents_list with (security_invoker = true) as
select d.*,
       coalesce(s.name, d.issuer) as issuer_sort,
       (
         coalesce((
           select sum(r.weight)
             from public.review_score_rules r
            where r.is_active
              and (r.applies_to_small_amounts or coalesce(d.is_small_amount, false) = false)
              and d.validation ->> r.check_key = 'false'
         ), 0)
         +
         coalesce((
           select case
                    when lowest is null then 0
                    when lowest < b.low_below then b.low_weight
                    when lowest < b.medium_below then b.medium_weight
                    else 0
                  end
             from public.review_confidence_bands b
             cross join lateral (
               select min(e.value::numeric) as lowest
                 from jsonb_each_text(coalesce(d.extracted -> b.confidence_key, '{}'::jsonb)) e
                where e.value ~ '^[0-9.]+$'
             ) c
         ), 0)
       )::integer as review_score,
       exists (
         select 1 from public.document_transaction_matches m
          where m.document_id = d.id and m.status in ('candidate', 'auto')
       ) as has_suggested_bank_match,
       exists (
         select 1 from public.document_transaction_matches m
          where m.document_id = d.id and m.status = 'confirmed'
       ) as has_confirmed_bank_match
  from public.documents d
  left join public.suppliers s on s.id = d.supplier_id
 where d.deleted_at is null
   -- A document that was split into its parts is represented by those parts, not by itself.
   and coalesce(d.status, '') <> 'split'
   and d.private_hold = false;

-- The same list with one lower-cased haystack column, so a plain text box can match what a person
-- typed without the caller assembling the same expression again.
create or replace view public.v_documents_search with (security_invoker = true) as
select l.*,
       lower(concat_ws(' ',
           l.issuer,
           l.invoice_number,
           l.service_description,
           l.cost_category,
           to_char(l.amount_gross, 'FM9999999990.00'),
           replace(to_char(l.amount_gross, 'FM9999999990.00'), '.', ','),
           to_char(l.amount_gross, 'FM9,999,999,990.00'),
           translate(to_char(l.amount_gross, 'FM9,999,999,990.00'), ',.', '.,')
       )) as search_text
  from public.v_documents_list l;

-- The same list, narrowed to what is actually waiting for a person.
create or replace view public.v_documents_review with (security_invoker = true) as
select *
  from public.v_documents_search
 where workflow_status in ('received', 'in_review', 'query')
    or review_score > 0
    or traffic_light in ('yellow', 'red');

-- What is still unpaid, and what stands in the way of paying it. A private-held document is not
-- counted here either, via document_is_countable().
create or replace view public.v_open_items with (security_invoker = true) as
select d.*,
       coalesce(m.matched_sum, 0) as matched_sum,
       public.invoice_is_fully_covered(
           public.amount_paid_out(d.amount_gross, d.tip_amount),
           case when d.paid_at is not null then abs(coalesce(public.amount_paid_out(d.amount_gross, d.tip_amount), 0))
                else coalesce(m.matched_sum, 0) end) as is_covered,
       case
         when public.invoice_is_fully_covered(
                public.amount_paid_out(d.amount_gross, d.tip_amount),
                case when d.paid_at is not null then abs(coalesce(public.amount_paid_out(d.amount_gross, d.tip_amount), 0))
                     else coalesce(m.matched_sum, 0) end) then null
         when public.is_a_reminder(d.id) then 'reminder_letter'
         when coalesce(d.amount_gross, 0) = 0 then 'no_amount'
         when d.amount_gross < 0 then 'credit_note'
         when coalesce(d.already_paid, false) then 'paid_privately'
         else null
       end as open_blocker,
       not public.invoice_is_fully_covered(
             public.amount_paid_out(d.amount_gross, d.tip_amount),
             case when d.paid_at is not null then abs(coalesce(public.amount_paid_out(d.amount_gross, d.tip_amount), 0))
                  else coalesce(m.matched_sum, 0) end)
         and coalesce(d.amount_gross, 0) > 0
         and coalesce(d.already_paid, false) = false
         and not public.is_a_reminder(d.id) as is_open
  from public.documents d
  left join (
        select document_id, sum(coalesce(amount_matched, 0)) as matched_sum
          from public.document_transaction_matches
         where status = 'confirmed'
         group by document_id
  ) m on m.document_id = d.id
 where d.deleted_at is null
   and d.archived_at is null
   and d.not_relevant_at is null
   and coalesce(d.status, '') <> 'split'
   and public.document_is_countable(d.status, d.private_hold);

-- needs_action now only counts documents the pipeline actually classified as invoices. See the
-- is_invoice backfill note at the top of this file.
create or replace function public.invoice_queue_kpis(p_today date default current_date) returns table(key text, count bigint, amount numeric)
language sql stable set search_path to 'public'
as $$
      with base as (select * from public.documents where true and private_hold = false and deleted_at is null and archived_at is null and not_relevant_at is null)
      select 'all'::text, count(*), coalesce(sum(amount_gross), 0) from base
      union all
      select 'needs_action'::text, count(*), coalesce(sum(amount_gross), 0) from base where status = 'needs_review' and is_invoice = true
      union all
      select 'missing_assignment'::text, count(*), coalesce(sum(amount_gross), 0) from base where company_id is null
      union all
      select 'ready_for_payment'::text, count(*), coalesce(sum(amount_gross), 0) from base  where workflow_status in ('approved_first', 'approved_final')    and paid_at is null and not public.is_a_reminder(id)
      union all
      select 'pay_now'::text, count(*), coalesce(sum(amount_gross), 0) from base where due_date <= p_today and paid_at is null and not public.is_direct_debit(payment_method) and not public.is_a_reminder(id)
      union all
      select 'completed'::text, count(*), coalesce(sum(amount_gross), 0) from base where paid_at is not null or workflow_status = 'closed';
    $$;

commit;
