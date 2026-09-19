-- 0085_outgoing_invoice_uploads.sql
-- Ports immonetz's outgoing-invoice upload feature (their migration
-- 20260806120000_outgoing_invoice_uploads.sql, commit 4c63f5a).
--
-- WHY: StäyHub has no LexOffice integration requirement at all (the client was explicit: "no
-- API integration to any invoicing tool"). The settled decision (communication/INDEX.md,
-- thread 4: "outgoing invoices by manual PDF upload into OPOS/reporting") was always a manual
-- upload, not a CSV bulk import — this migration is that path. Unlike immonetz (where IMKO still
-- has a real LexOffice account as a working creation path), upload becomes the ONLY way to
-- create an outgoing invoice for any real Stäy company: the existing `/ausgangsrechnungen/neu`
-- LexOffice-backed form (already in this repo, ported from immonetz) has nothing to write to.
--
-- Builds on the existing LexOffice-backed model (this repo's migration 0052, ported from
-- immonetz's 0039; matching in 0058, ported from immonetz's 0045) rather than a parallel table,
-- so the list screen, filters, and bank-matching machinery already here work unchanged for both
-- kinds of invoice:
--   * outgoing_invoices.source gains a third value, 'upload', alongside 'app'/'lexoffice' (both
--     meaning "backed by a real LexOffice voucher"). lexoffice_voucher_id becomes nullable.
--   * customers.source also gains 'upload' — a local-only customer, never mirrored into
--     LexOffice (lexoffice_contact_id stays null). Needed because the only existing customer
--     creation path requires a configured LexOffice API key, which no real Stäy company has.
--   * outgoing_invoices.status_source ('auto' | 'manual' | null) — only meaningful for
--     source='upload' rows: who last set voucher_status. Always null for 'app'/'lexoffice' rows,
--     where LexOffice itself stays the sole status authority, unchanged.
--   * outgoing_invoice_files — new table, one row per uploaded invoice's stored file. LexOffice-
--     backed invoices never have one (LexOffice generates the PDF; this app never stores it).
--   * Storage bucket outgoing-invoice-files — private, no storage.objects policies, signed URLs
--     only (docs/FILE_STORAGE.md convention).
--   * set_uploaded_outgoing_invoice_status() — SECURITY DEFINER RPC for a manual status
--     override. Rejects outright if the target row's source <> 'upload'.
--   * sync_uploaded_outgoing_invoice_status_from_matches() — trigger on
--     outgoing_invoice_transaction_matches, mirrors sync_invoice_paid_from_matches() (this
--     repo's migration 0037, ported from immonetz's 0024): "set-only against an existing value,
--     never clobber a manual decision, in EITHER direction." Scoped to source='upload' only.
--
-- Idempotent throughout: `if not exists`, `drop policy/trigger/constraint if exists`, same
-- convention as 0052/0058/0083/0084.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'outgoing_invoices')
  then raise exception '0085 preconditions failed: table outgoing_invoices is missing (run 0052 first)';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'outgoing_invoice_transaction_matches')
  then raise exception '0085 preconditions failed: table outgoing_invoice_transaction_matches is missing (run 0058 first)';
  end if;
  if not exists (select 1 from information_schema.routines
                  where routine_schema = 'public' and routine_name = 'outgoing_invoice_matched_sum')
  then raise exception '0085 preconditions failed: function outgoing_invoice_matched_sum is missing (run 0058 first)';
  end if;
  if not exists (select 1 from information_schema.routines
                  where routine_schema = 'public' and routine_name = 'payment_tolerance')
  then raise exception '0085 preconditions failed: function payment_tolerance is missing (run 0037 first)';
  end if;
  if not exists (select 1 from information_schema.routines
                  where routine_schema = 'public' and routine_name = 'link_outgoing_invoice_transaction')
  then raise exception '0085 preconditions failed: function link_outgoing_invoice_transaction is missing (run 0058 first)';
  end if;
  raise notice '0085 preconditions ok';
end $$;

-- ===========================================================================
-- 1. outgoing_invoices: allow source='upload', nullable lexoffice_voucher_id, status_source
-- ===========================================================================
alter table public.outgoing_invoices
  alter column lexoffice_voucher_id drop not null;

alter table public.outgoing_invoices
  drop constraint if exists outgoing_invoices_source_check;
alter table public.outgoing_invoices
  add constraint outgoing_invoices_source_check check (source in ('app', 'lexoffice', 'upload'));

-- customers.source gets the same third value — see the migration header for why.
alter table public.customers
  drop constraint if exists customers_source_check;
alter table public.customers
  add constraint customers_source_check check (source in ('app', 'lexoffice', 'upload'));

alter table public.outgoing_invoices
  add column if not exists status_source text check (status_source in ('auto', 'manual'));

comment on column public.outgoing_invoices.status_source is
  'Only meaningful for source=''upload'' rows: who last set voucher_status -- ''auto'' (the '
  'bank-match trigger below) or ''manual'' (set_uploaded_outgoing_invoice_status). Always NULL '
  'for source in (''app'',''lexoffice''), where LexOffice itself stays the sole status authority.';

-- ===========================================================================
-- 2. outgoing_invoice_files -- Storage-only file record for an uploaded invoice
-- ===========================================================================
create table if not exists public.outgoing_invoice_files (
  id                    uuid primary key default gen_random_uuid(),
  outgoing_invoice_id   uuid not null references public.outgoing_invoices(id),
  filename              text not null,
  mime                  text,
  size_bytes            integer,
  storage_bucket        text not null,
  storage_path          text not null,
  checksum_sha256       text,
  created_by            text,
  created_at            timestamptz not null default now(),
  unique (outgoing_invoice_id)
);

create index if not exists idx_outgoing_invoice_files_invoice_id
  on public.outgoing_invoice_files (outgoing_invoice_id);

alter table public.outgoing_invoice_files enable row level security;

drop policy if exists "outgoing_invoice_files_select" on public.outgoing_invoice_files;
create policy "outgoing_invoice_files_select" on public.outgoing_invoice_files
  for select to authenticated using (true);
-- No insert/update/delete policy for `authenticated` -- written only by the upload server
-- function via the service-role client, same convention as outgoing_invoices itself (0052).

-- ===========================================================================
-- 3. Storage bucket -- private, no storage.objects policies, signed URLs only
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('outgoing-invoice-files', 'outgoing-invoice-files', false)
on conflict (id) do nothing;

-- ===========================================================================
-- 4. set_uploaded_outgoing_invoice_status -- manual status override, source='upload' rows only
-- ===========================================================================
create or replace function public.set_uploaded_outgoing_invoice_status(
  p_id      uuid,
  p_status  text,
  p_actor   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  if p_status not in ('draft', 'open', 'paidoff', 'voided') then
    raise exception 'set_uploaded_outgoing_invoice_status: invalid status %', p_status
      using errcode = 'check_violation';
  end if;

  select source into v_source from public.outgoing_invoices where id = p_id;
  if v_source is null then
    raise exception 'set_uploaded_outgoing_invoice_status: outgoing invoice % not found', p_id;
  end if;
  if v_source <> 'upload' then
    raise exception
      'set_uploaded_outgoing_invoice_status: invoice % is source=%, not upload -- LexOffice is the status authority for it, not this app',
      p_id, v_source using errcode = 'insufficient_privilege';
  end if;

  update public.outgoing_invoices
     set voucher_status = p_status, status_source = 'manual', updated_at = now()
   where id = p_id;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values ('outgoing_invoices', p_id, 'statuswechsel',
          format('Status manuell auf "%s" gesetzt', p_status), p_actor,
          jsonb_build_object('voucher_status', p_status), now());
end;
$$;

grant execute on function public.set_uploaded_outgoing_invoice_status(uuid, text, text) to authenticated;

-- ===========================================================================
-- 5. Auto-flip source='upload' invoices to paidoff/open from confirmed bank matches. Mirrors
--    sync_invoice_paid_from_matches (migration 0037) but writes voucher_status on
--    outgoing_invoices instead of paid_at on invoices. Scoped to source='upload' only -- at the
--    time this migration was written that was the only source that could set its own paid status
--    locally; LexOffice was removed entirely in migration 0086, so 'upload' is now the only source.
-- ===========================================================================
create or replace function public.sync_uploaded_outgoing_invoice_status_from_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id    uuid := coalesce(new.outgoing_invoice_id, old.outgoing_invoice_id);
  v_source        text;
  v_gross         numeric;
  v_status        text;
  v_status_source text;
  v_matched       numeric;
begin
  select source, amount_gross, voucher_status, status_source
    into v_source, v_gross, v_status, v_status_source
    from public.outgoing_invoices where id = v_invoice_id;
  if not found or v_source <> 'upload' then
    return null;
  end if;

  select public.outgoing_invoice_matched_sum(v_invoice_id) into v_matched;

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    -- A manual override (status_source='manual') is never touched in EITHER direction -- e.g.
    -- someone deliberately holding an invoice 'open' despite a covering match must not have it
    -- silently flipped back to 'paidoff' the next time this trigger fires.
    if v_status_source is distinct from 'manual' and v_status not in ('paidoff', 'voided') then
      update public.outgoing_invoices
         set voucher_status = 'paidoff', status_source = 'auto', updated_at = now()
       where id = v_invoice_id;

      insert into public.change_history (table_name, record_id, type, text, actor, data, at)
      values ('outgoing_invoices', v_invoice_id, 'statuswechsel',
              'Als bezahlt markiert (bestätigter Bankabgleich)', 'system',
              jsonb_build_object('voucher_status', 'paidoff', 'matched', v_matched, 'gross', v_gross),
              now());
    end if;
  else
    -- No longer covered (link removed or amount reduced). Only a status THIS trigger set is
    -- withdrawn -- a manual override is never touched.
    if v_status = 'paidoff' and v_status_source = 'auto' then
      update public.outgoing_invoices
         set voucher_status = 'open', status_source = null, updated_at = now()
       where id = v_invoice_id;

      insert into public.change_history (table_name, record_id, type, text, actor, data, at)
      values ('outgoing_invoices', v_invoice_id, 'statuswechsel',
              'Zahlung zurückgenommen: Bankabgleich deckt die Rechnung nicht mehr vollständig',
              'system',
              jsonb_build_object('voucher_status', 'open', 'matched', v_matched, 'gross', v_gross),
              now());
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_uploaded_outgoing_invoice_status on public.outgoing_invoice_transaction_matches;
create trigger trg_sync_uploaded_outgoing_invoice_status
  after insert or update or delete on public.outgoing_invoice_transaction_matches
  for each row execute function public.sync_uploaded_outgoing_invoice_status_from_matches();

commit;

-- ===========================================================================
-- 6. Self-checks
-- ===========================================================================

-- 6a. outgoing_invoices.source and customers.source accept 'upload' and still reject a bogus value.
do $$
begin
  begin
    insert into public.outgoing_invoices (company_id, customer_id, source)
    select id, gen_random_uuid(), 'not-a-real-source' from public.companies limit 1;
    raise exception '0085 self-check 6a FAILED: bogus outgoing_invoices.source value was accepted';
  exception
    when check_violation then null;
    when foreign_key_violation then null;
  end;

  begin
    insert into public.customers (company_id, name, source)
    select id, 'self-check probe', 'not-a-real-source' from public.companies limit 1;
    raise exception '0085 self-check 6a FAILED: bogus customers.source value was accepted';
  exception
    when check_violation then null;
  end;

  raise notice '0085 self-check 6a ok: outgoing_invoices.source and customers.source reject unknown values';
end $$;

-- 6b. lexoffice_voucher_id is nullable now.
do $$
declare
  v_nullable text;
begin
  select is_nullable into v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'outgoing_invoices'
     and column_name = 'lexoffice_voucher_id';
  if v_nullable is distinct from 'YES' then
    raise exception '0085 self-check 6b FAILED: lexoffice_voucher_id is still NOT NULL';
  end if;
  raise notice '0085 self-check 6b ok: lexoffice_voucher_id is nullable';
end $$;

-- 6c. authenticated can execute set_uploaded_outgoing_invoice_status; outgoing_invoice_files has
-- RLS enabled and no write policy for authenticated.
do $$
declare
  v_bad text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'set_uploaded_outgoing_invoice_status'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    v_bad := v_bad || 'authenticated cannot execute set_uploaded_outgoing_invoice_status';
  end if;
  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'outgoing_invoice_files' and rowsecurity
  ) then
    v_bad := v_bad || 'outgoing_invoice_files does not have row level security enabled';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'outgoing_invoice_files'
       and cmd in ('INSERT', 'UPDATE', 'ALL') and 'authenticated' = any(roles)
  ) then
    v_bad := v_bad || 'outgoing_invoice_files has a write policy for authenticated';
  end if;

  if array_length(v_bad, 1) > 0 then
    raise exception '0085 self-check 6c FAILED: %', array_to_string(v_bad, '; ');
  end if;
  raise notice '0085 self-check 6c ok: RPC grant present, outgoing_invoice_files write-locked to service role';
end $$;

-- 6d. set_uploaded_outgoing_invoice_status rejects a non-upload row and applies to an upload row;
-- change_history gets the entry; the whole probe rolls back via the restrict_violation sentinel.
do $$
declare
  v_company_id  uuid;
  v_customer_id uuid;
  v_lex_id      uuid;
  v_upload_id   uuid;
  v_rejected    boolean := false;
  v_status      text;
  v_source      text;
  v_hist_count  int;
begin
  select id into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise notice '0085 self-check 6d skipped: no company available to probe';
  else
    insert into public.customers (company_id, name) values (v_company_id, 'Selbsttest 0085 GmbH')
      returning id into v_customer_id;

    insert into public.outgoing_invoices (company_id, customer_id, lexoffice_voucher_id, source, amount_gross)
      values (v_company_id, v_customer_id, gen_random_uuid(), 'lexoffice', 119)
      returning id into v_lex_id;
    insert into public.outgoing_invoices (company_id, customer_id, source, voucher_status, amount_gross)
      values (v_company_id, v_customer_id, 'upload', 'open', 119)
      returning id into v_upload_id;

    begin
      perform public.set_uploaded_outgoing_invoice_status(v_lex_id, 'paidoff', 'tester');
      v_rejected := false;
    exception
      when insufficient_privilege then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '0085 self-check 6d FAILED: a lexoffice-sourced invoice accepted a manual status override';
    end if;

    perform public.set_uploaded_outgoing_invoice_status(v_upload_id, 'paidoff', 'tester');
    select voucher_status, source into v_status, v_source
      from public.outgoing_invoices where id = v_upload_id;
    if v_status is distinct from 'paidoff' then
      raise exception '0085 self-check 6d FAILED: upload-sourced invoice status did not update';
    end if;

    select count(*) into v_hist_count
      from public.change_history
     where table_name = 'outgoing_invoices' and record_id = v_upload_id and type = 'statuswechsel';
    if v_hist_count < 1 then
      raise exception '0085 self-check 6d FAILED: no change_history entry written';
    end if;

    raise notice '0085 self-check 6d ok: manual status override is upload-only and logged';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0085 self-check 6d rollback';
exception
  when restrict_violation then null;
end $$;

-- 6e. sync_uploaded_outgoing_invoice_status_from_matches never overwrites a manual override, in
-- EITHER direction. Only reads existing bank_connections/bank_accounts rows -- skips gracefully
-- if neither exists to probe against.
do $$
declare
  v_company_id  uuid;
  v_customer_id uuid;
  v_account_id  uuid;
  v_conn_id     uuid;
  v_invoice_id  uuid;
  v_tx_id       uuid;
  v_status      text;
  v_status_src  text;
begin
  select id into v_company_id from public.companies limit 1;
  select id into v_conn_id from public.bank_connections limit 1;
  select id into v_account_id from public.bank_accounts limit 1;

  if v_company_id is null or v_conn_id is null or v_account_id is null then
    raise notice '0085 self-check 6e skipped: no company/bank connection/bank account available to probe';
  else
    insert into public.customers (company_id, name) values (v_company_id, 'Selbsttest 0085b GmbH')
      returning id into v_customer_id;
    insert into public.outgoing_invoices (company_id, customer_id, source, voucher_status, amount_gross)
      values (v_company_id, v_customer_id, 'upload', 'open', 119)
      returning id into v_invoice_id;

    -- Manually (re-)confirm 'open' so status_source='manual', same as a user deliberately
    -- holding the invoice open despite an incoming payment they haven't reconciled themselves.
    perform public.set_uploaded_outgoing_invoice_status(v_invoice_id, 'open', 'tester');

    insert into public.bank_transactions (account_id, connection_id, banksapi_hash, amount, matching_status)
      values (v_account_id, v_conn_id, 'selftest-upload-outgoing-0085b', 119, 'offen')
      returning id into v_tx_id;

    perform public.link_outgoing_invoice_transaction(v_invoice_id, v_tx_id);

    select voucher_status, status_source into v_status, v_status_src
      from public.outgoing_invoices where id = v_invoice_id;
    if v_status is distinct from 'open' or v_status_src is distinct from 'manual' then
      raise exception
        '0085 self-check 6e FAILED: trigger overwrote a manual override (status=%, status_source=%)',
        v_status, v_status_src;
    end if;

    raise notice '0085 self-check 6e ok: a confirmed covering match does not overwrite a manual status override';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0085 self-check 6e rollback';
exception
  when restrict_violation then null;
end $$;

-- ===========================================================================
-- Sanity (run manually after applying):
--   select id, source, voucher_status, status_source from public.outgoing_invoices where source = 'upload';
--   select id, storage_bucket, storage_path from public.outgoing_invoice_files limit 5;
-- ===========================================================================
