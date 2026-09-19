-- 0018_opos_whitelist — the OPOS whitelist: hide bank transactions that can never have a receipt.
--
-- WHY (Briefing Screen 10, "The open-items list (OPOS)"): "OPOS needs a whitelist, otherwise it is
-- unusable after a week: salaries, tax prepayments, private withdrawals, rebookings and loan
-- installments never have a receipt — they must be hideable, otherwise the real missing receipt gets
-- lost in the list." Restated at Screen 8: "Some transactions legitimately never have a receipt
-- (salaries, taxes, rebookings) -> hide via the whitelist."
--
-- Measured on dev before this migration: 289 open outgoing transactions in the Hub's "Fehlende Belege"
-- tab, of which 105 are structurally receipt-less (ATM withdrawals "GA NR...", "Uebertrag auf
-- Girokonto", "Kontoführungsgebühr", "Darlehenszinsen", "Kapitalertragsteuer aus Zinsen").
--
-- HOW: we do NOT add a parallel "hidden" flag. matching_status already has the terminal state
-- 'ignoriert' (immonetz 0001) and every consumer already honours it:
--   * the Hub's Offene Posten tab filters matching_status='offen' (offene-posten/index.tsx),
--   * bank-sync loads only 'offen' rows for matching (bank-sync/index.ts),
--   * sync_transaction_matching_status() refuses to overwrite it ("... and matching_status <>
--     'ignoriert'", 0008).
-- The only thing missing was a writer. This migration supplies it as a TRIGGER, because
-- bank_transactions is written from three places (the bank-sync edge function, this pipeline, and by
-- hand) and a trigger is one implementation covering all of them — the same reasoning as the
-- company-inheritance trigger in 0014.
--
-- OWNERSHIP: the bank base tables are Hub-owned (immonetz 0001); like 0005/0014 this migration only
-- ADDS columns, functions and triggers and leaves the Hub's RLS policies untouched. The Hub gets its
-- write path through two security-definer RPCs (it already calls sb.rpc() for invoices_kpis /
-- invoices_facets), NOT through a blanket UPDATE policy on a Hub-owned table.
--
-- Additive + idempotent.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0018_opos_whitelist.sql

begin;

-- ---------------------------------------------------------------------------------------------------
-- 1. The rule table — shape deliberately mirrored from ingest_exclusions (Briefing Screen 14), so the
--    Hub CRUD screen and the pipeline reader follow a pattern that already exists in this project.
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.opos_whitelist_rules (
  id          uuid primary key default gen_random_uuid(),
  term        text not null,
  scope       text not null default 'reference',
  category    text not null default 'other',
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now()
);

-- Uniform soft-delete on pipeline-owned master data (GoBD, Briefing Screen 18) — same columns the
-- 0011 loop adds to companies/properties/ingest_exclusions/...
alter table public.opos_whitelist_rules add column if not exists deleted_at    timestamptz;
alter table public.opos_whitelist_rules add column if not exists deleted_by    text;
alter table public.opos_whitelist_rules add column if not exists delete_reason text;

-- scope decides WHICH transaction field the term is matched against.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opos_whitelist_rules_scope_chk') then
    alter table public.opos_whitelist_rules add constraint opos_whitelist_rules_scope_chk
      check (scope in ('reference', 'counterparty', 'iban', 'booking_text', 'any'));
  end if;
  -- category is the REASON a receipt will never exist. The first five are the briefing's named
  -- categories verbatim; the last three are what the real booking texts actually contain.
  if not exists (select 1 from pg_constraint where conname = 'opos_whitelist_rules_category_chk') then
    alter table public.opos_whitelist_rules add constraint opos_whitelist_rules_category_chk
      check (category in ('salary', 'tax_prepayment', 'private_withdrawal', 'rebooking',
                          'loan_installment', 'fee_interest', 'atm_withdrawal', 'other'));
  end if;
end $$;

create unique index if not exists opos_whitelist_rules_term_scope_uniq
  on public.opos_whitelist_rules (lower(term), scope);
create index if not exists opos_whitelist_rules_active_idx
  on public.opos_whitelist_rules (is_active) where deleted_at is null;

comment on table public.opos_whitelist_rules is
  'OPOS whitelist (Briefing Screen 10): booking-text/counterparty terms whose transactions never have '
  'a receipt. A match parks the transaction in matching_status=''ignoriert'' so it drops out of the '
  'open-items list and out of matching. Hub-editable; the pipeline only seeds.';

-- ---------------------------------------------------------------------------------------------------
-- 2. Provenance on the transaction — so a rule-hide is distinguishable from a human's, and revertable.
-- ---------------------------------------------------------------------------------------------------
alter table public.bank_transactions
  add column if not exists no_receipt_reason text,
  add column if not exists whitelist_rule_id uuid references public.opos_whitelist_rules(id),
  add column if not exists no_receipt_set_by text,
  add column if not exists no_receipt_set_at timestamptz;

comment on column public.bank_transactions.no_receipt_reason is
  'Why this transaction will never have a receipt (opos_whitelist_rules.category). Set together with '
  'matching_status=''ignoriert''.';
comment on column public.bank_transactions.whitelist_rule_id is
  'The whitelist rule that hid this transaction. NULL while hidden means a HUMAN decided it — rules '
  'must never overwrite or release that.';

create index if not exists bank_transactions_whitelist_rule_idx
  on public.bank_transactions (whitelist_rule_id);

-- ---------------------------------------------------------------------------------------------------
-- 3. Matching. One implementation, shared by the trigger and the backfill CLI.
-- ---------------------------------------------------------------------------------------------------

-- Case- and whitespace-insensitive. Deliberately simpler than resolve_codes.normalize(): booking texts
-- are not company names, so punctuation must survive ("GA NR", IBANs) and there are no legal suffixes
-- to strip.
create or replace function public.opos_norm(p_text text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

-- Returns at most one rule — the oldest matching one, so the outcome is deterministic and stable as
-- rules are added.
create or replace function public.match_opos_whitelist(
  p_reference    text,
  p_counterparty text,
  p_iban         text,
  p_booking_text text
)
returns table (rule_id uuid, category text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.category
    from public.opos_whitelist_rules r
   where r.is_active
     and r.deleted_at is null
     and public.opos_norm(r.term) <> ''
     and position(
           public.opos_norm(r.term) in
           case r.scope
             when 'reference'    then public.opos_norm(p_reference)
             when 'counterparty' then public.opos_norm(p_counterparty)
             when 'iban'         then public.opos_norm(p_iban)
             when 'booking_text' then public.opos_norm(p_booking_text)
             else public.opos_norm(concat_ws(' ', p_reference, p_counterparty, p_iban, p_booking_text))
           end
         ) > 0
   order by r.created_at, r.term
   limit 1;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4. The trigger — applies the rules on every write to the matched fields.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.apply_opos_whitelist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule_id  uuid;
  v_category text;
begin
  -- OUTGOING ONLY. The briefing's OPOS question is "what is debited in which company, but the receipt
  -- is missing?", the Hub's "Fehlende Belege" tab filters direction='ausgehend', and the matcher only
  -- looks at amount < 0. Incoming credits therefore never appear in the open-items list, so hiding them
  -- would achieve nothing and would touch rows the other OPOS side (receipts without a transaction)
  -- still needs — a credit is what PAYS one of our outgoing invoices.
  --
  -- Tested on amount, NOT on direction: `direction` is GENERATED ALWAYS AS (case when amount < 0 then
  -- 'ausgehend' else 'eingehend' end), and a generated column is computed AFTER before-row triggers, so
  -- new.direction is still NULL here. Reading it would make this guard fire on every insert and the
  -- whitelist would silently never apply. `amount < 0` is the same test, one step earlier.
  if new.amount is null or new.amount >= 0 then
    return new;
  end if;

  -- Never re-decide a transaction that is reconciled with a receipt.
  if new.matching_status = 'zugeordnet' then
    return new;
  end if;

  -- Never overwrite or release a HUMAN decision (hidden with no rule behind it).
  if new.matching_status = 'ignoriert' and new.whitelist_rule_id is null then
    return new;
  end if;

  select m.rule_id, m.category
    into v_rule_id, v_category
    from public.match_opos_whitelist(new.payment_reference, new.counterparty_holder,
                                     new.counterparty_iban, new.booking_text) m;

  if v_rule_id is not null then
    new.matching_status   := 'ignoriert';
    new.no_receipt_reason := v_category;
    new.whitelist_rule_id := v_rule_id;
    new.no_receipt_set_by := coalesce(new.no_receipt_set_by, 'system');
    new.no_receipt_set_at := coalesce(new.no_receipt_set_at, now());
  elsif new.whitelist_rule_id is not null then
    -- It was hidden BY A RULE and no longer matches (rule deactivated, or the text changed) — release
    -- it back into the open-items list. A human's decision never lands here (guarded above).
    new.matching_status   := 'offen';
    new.no_receipt_reason := null;
    new.whitelist_rule_id := null;
    new.no_receipt_set_by := null;
    new.no_receipt_set_at := null;
  end if;

  return new;
end;
$$;

-- Fires on insert and whenever a matched field changes. It deliberately does NOT fire on a
-- matching_status-only update, so sync_transaction_matching_status() (0008) keeps working untouched.
-- `amount` is in the list because the outgoing/incoming guard is derived from it (see the function):
-- a corrected sign must re-evaluate. `direction` is NOT listed — it is a generated column and can
-- never be the subject of an UPDATE.
drop trigger if exists trg_apply_opos_whitelist on public.bank_transactions;
create trigger trg_apply_opos_whitelist
  before insert or update of payment_reference, counterparty_holder, counterparty_iban, booking_text,
                             amount
  on public.bank_transactions
  for each row execute function public.apply_opos_whitelist();

-- ---------------------------------------------------------------------------------------------------
-- 5. The Hub's write path — security-definer RPCs instead of an UPDATE policy on a Hub-owned table.
--    "Must be hideable" (Screen 10) needs a manual escape hatch for the cases no rule covers.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.opos_set_no_receipt(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason is null or p_reason not in ('salary', 'tax_prepayment', 'private_withdrawal',
        'rebooking', 'loan_installment', 'fee_interest', 'atm_withdrawal', 'other') then
    raise exception 'opos_set_no_receipt: invalid reason %', p_reason;
  end if;

  update public.bank_transactions
     set matching_status   = 'ignoriert',
         no_receipt_reason = p_reason,
         whitelist_rule_id = null,           -- NULL = a human decided this
         no_receipt_set_by = coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub'),
         no_receipt_set_at = now()
   where id = p_transaction_id
     and matching_status <> 'zugeordnet';    -- never un-reconcile a matched payment
end;
$$;

create or replace function public.opos_clear_no_receipt(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
end;
$$;

revoke all on function public.opos_set_no_receipt(uuid, text)  from public, anon;
revoke all on function public.opos_clear_no_receipt(uuid)      from public, anon;
grant execute on function public.opos_set_no_receipt(uuid, text) to authenticated;
grant execute on function public.opos_clear_no_receipt(uuid)     to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 6. RLS on the rule table — mirrors 0016_exclusion_rls.sql exactly (no delete policy; deactivating a
--    rule and soft-deleting it are both UPDATEs). The pipeline writes via service_role, bypassing RLS.
-- ---------------------------------------------------------------------------------------------------
alter table public.opos_whitelist_rules enable row level security;

do $$
begin
  execute 'drop policy if exists opos_whitelist_auth_read   on public.opos_whitelist_rules';
  execute 'create policy opos_whitelist_auth_read   on public.opos_whitelist_rules for select to authenticated using (true)';
  execute 'drop policy if exists opos_whitelist_auth_insert on public.opos_whitelist_rules';
  execute 'create policy opos_whitelist_auth_insert on public.opos_whitelist_rules for insert to authenticated with check (true)';
  execute 'drop policy if exists opos_whitelist_auth_update on public.opos_whitelist_rules';
  execute 'create policy opos_whitelist_auth_update on public.opos_whitelist_rules for update to authenticated using (true) with check (true)';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- 7. Seed. The briefing's five named categories plus the three the real booking texts show. Terms are
--    kept SPECIFIC on purpose: substring matching is loose, so e.g. 'Lohn/Gehalt' and 'Lohnzahlung'
--    are seeded rather than a bare 'Lohn' (which would also hit a supplier called "Lohnert GmbH").
--    Seed only — the Hub owns these rows from here on, so re-applying must not resurrect edits.
-- ---------------------------------------------------------------------------------------------------
insert into public.opos_whitelist_rules (term, scope, category, note, created_by) values
  -- salaries
  ('Lohn/Gehalt',            'reference',    'salary',             'Briefing Screen 10: salaries never have a receipt', 'seed_0018'),
  ('Lohnzahlung',            'reference',    'salary',             'Briefing Screen 10: salaries never have a receipt', 'seed_0018'),
  ('Gehaltszahlung',         'reference',    'salary',             'Briefing Screen 10: salaries never have a receipt', 'seed_0018'),
  ('Sozialversicherung',     'reference',    'salary',             'Payroll side costs, no supplier invoice',           'seed_0018'),
  -- tax prepayments
  ('Finanzamt',              'counterparty', 'tax_prepayment',     'Briefing Screen 10: taxes never have a receipt',    'seed_0018'),
  ('Steuervorauszahlung',    'reference',    'tax_prepayment',     'Briefing Screen 10: taxes never have a receipt',    'seed_0018'),
  ('Umsatzsteuer',           'reference',    'tax_prepayment',     'VAT payment — pass-through, no receipt',            'seed_0018'),
  ('Kapitalertragsteuer',    'reference',    'tax_prepayment',     'Seen in dev booking texts',                         'seed_0018'),
  ('Solidaritaetszuschlag',  'reference',    'tax_prepayment',     'Seen in dev booking texts (also spelled with ä)',   'seed_0018'),
  ('Solidaritätszuschlag',   'reference',    'tax_prepayment',     'Seen in dev booking texts',                         'seed_0018'),
  ('Koerperschaftsteuer',    'reference',    'tax_prepayment',     'Appendix A3 taxes',                                 'seed_0018'),
  ('Gewerbesteuer',          'reference',    'tax_prepayment',     'Appendix A3 taxes',                                 'seed_0018'),
  -- private withdrawals
  ('Privatentnahme',         'reference',    'private_withdrawal', 'Briefing Screen 10 + Appendix A3',                  'seed_0018'),
  ('Privateinlage',          'reference',    'private_withdrawal', 'Briefing Appendix A3 (deposit)',                    'seed_0018'),
  -- rebookings between own accounts
  ('Umbuchung',              'reference',    'rebooking',          'Briefing Screen 10: rebookings never have a receipt', 'seed_0018'),
  ('Uebertrag',              'reference',    'rebooking',          'Seen in dev: "Uebertrag auf Girokonto"',            'seed_0018'),
  ('Übertrag',               'reference',    'rebooking',          'Umlaut spelling of the same booking text',          'seed_0018'),
  -- loan installments
  ('Darlehen',               'reference',    'loan_installment',   'Briefing Screen 10 (covers Darlehenszinsen too)',   'seed_0018'),
  ('Tilgung',                'reference',    'loan_installment',   'Briefing Screen 10: loan installments',             'seed_0018'),
  ('Annuitaet',              'reference',    'loan_installment',   'Briefing Screen 10: loan installments',             'seed_0018'),
  ('Annuität',               'reference',    'loan_installment',   'Umlaut spelling',                                   'seed_0018'),
  -- bank fees / interest (no supplier invoice is ever issued for these)
  ('Kontofuehrungsgebuehr',  'reference',    'fee_interest',       'Bank fee, no supplier invoice',                     'seed_0018'),
  ('Kontoführungsgebühr',    'reference',    'fee_interest',       'Seen in dev booking texts',                         'seed_0018'),
  ('Entgeltabschluss',       'reference',    'fee_interest',       'Bank quarterly fee posting',                        'seed_0018'),
  ('Abschluss lt. Rechnung', 'reference',    'fee_interest',       'Standard German bank fee booking text',             'seed_0018'),
  -- ATM cash withdrawals: the cash itself has no receipt; the receipt follows for what it buys
  ('GA NR',                  'reference',    'atm_withdrawal',     'Seen in dev: ATM withdrawal booking text',          'seed_0018'),
  ('Bargeldauszahlung',      'reference',    'atm_withdrawal',     'ATM / counter cash withdrawal',                     'seed_0018'),
  ('Geldautomat',            'reference',    'atm_withdrawal',     'ATM withdrawal',                                    'seed_0018')
on conflict (lower(term), scope) do nothing;

commit;

-- Sanity:
--   select matching_status, direction, count(*) from bank_transactions group by 1,2 order by 1,2;
--   select no_receipt_reason, count(*) from bank_transactions
--     where matching_status='ignoriert' group by 1 order by 2 desc;
--   select * from match_opos_whitelist('Uebertrag auf Girokonto', null, null, null);
-- NOTE: the trigger only fires on WRITE — existing rows are backfilled by
--   python3 pipeline/apply_opos_whitelist.py --apply
