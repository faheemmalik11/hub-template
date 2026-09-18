-- 0057_bank_transaction_auto_categorize.sql
-- Briefing Screen 4 ("The learning system"): "As soon as a receipt is linked with a bank
-- transaction, the system learns the chain payment reference + issuer/supplier -> category. With
-- that, transactions without a receipt can also be categorized automatically."
--
-- migration 0030 already built the learning half (learn_assignment_rule_from_match) and a
-- read-only SUGGESTION for the receiptless case (resolve_transaction_category, shown in
-- offene-posten's VorschlagZelle) — deliberately stopping short of writing it anywhere, on the
-- same "recommendation only" stance the briefing takes for the VAT reserve. Read literally,
-- though, the briefing asks for actual automatic categorization here, not just a suggestion a
-- human has to notice and act on. This migration closes that gap:
--
--   1. bank_transactions gets category_id (-> bwa_categories) + category_source ('rule'|'human'),
--      the exact same sourced-value pattern already used everywhere else in this engine
--      (cost_category_source, vat_source, vat_deductibility_source) — 'human' is never
--      auto-overwritten, same "human beats rule" rule as always.
--   2. A trigger runs resolve_transaction_category() automatically after a transaction is
--      inserted, and again after its counterparty IBAN or payment reference changes, writing the
--      result as category_source='rule' whenever it finds a match and nothing human-set is in the
--      way. Mirrors trg_invoices_apply_rules_on_insert (migration 0031) — AFTER, not BEFORE,
--      because resolve_transaction_category re-reads the row from the table by id and a BEFORE
--      trigger would still see the pre-change values.
--   3. A one-time backfill applies the same resolution to every existing untouched row, so this
--      is not only forward-looking.
--   4. opos_set_category(): the human override, a SECURITY DEFINER RPC in the same shape as the
--      existing opos_set_no_receipt() — bank_transactions has no direct UPDATE policy for
--      authenticated (SELECT only, migration 0046), so every write to it goes through an RPC.
--
-- resolve_transaction_category() itself is UNCHANGED — this migration only starts writing its
-- result somewhere, it does not touch how the category is resolved.

begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resolve_transaction_category'
  ) then
    raise exception 'migration 0057 expects resolve_transaction_category from migration 0030, which is missing';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'bwa_categories')
  then
    raise exception 'migration 0057 expects public.bwa_categories from migration 0030, which is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. category_id / category_source on bank_transactions
-- ===========================================================================
alter table public.bank_transactions
  add column if not exists category_id uuid references public.bwa_categories(id),
  add column if not exists category_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bank_transactions'::regclass
       and conname = 'bank_transactions_category_source_check'
  ) then
    alter table public.bank_transactions add constraint bank_transactions_category_source_check
      check (category_source is null or category_source in ('rule', 'human'));
  end if;
end $$;

comment on column public.bank_transactions.category_id is
  'Cost category for a transaction with no matched receipt of its own (the receiptless/recurring-'
  'debit case, Briefing Screen 4 "learning system"). A matched transaction is still categorized '
  'through its linked invoice, not this column. See migration 0057.';
comment on column public.bank_transactions.category_source is
  'rule = written automatically by resolve_transaction_category() via the categorize trigger; '
  'human = set or overridden via opos_set_category(). Same ai|rule|human-style provenance and '
  '"human is never auto-overwritten" rule as cost_category_source/vat_source elsewhere (no ai '
  'value here — nothing extracts a bank transaction''s category from AI). See migration 0057.';

create index if not exists idx_bank_transactions_category on public.bank_transactions (category_id);

-- ===========================================================================
-- 2. Auto-categorize trigger
-- ===========================================================================
create or replace function public.trg_fn_bank_transactions_categorize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category uuid;
begin
  v_category := public.resolve_transaction_category(new.id);
  if v_category is not null then
    update public.bank_transactions
       set category_id = v_category, category_source = 'rule'
     where id = new.id
       and coalesce(category_source, 'rule') <> 'human';
  end if;
  return null; -- ignored on an AFTER trigger
end $$;

comment on function public.trg_fn_bank_transactions_categorize() is
  'Writes resolve_transaction_category()''s result onto the row as category_source=''rule'' -- '
  'never touches a human-sourced value. AFTER, not BEFORE: resolve_transaction_category re-reads '
  'the committed row by id. See migration 0057.';

drop trigger if exists trg_bank_transactions_categorize_insert on public.bank_transactions;
create trigger trg_bank_transactions_categorize_insert
  after insert on public.bank_transactions
  for each row execute function public.trg_fn_bank_transactions_categorize();

drop trigger if exists trg_bank_transactions_categorize_update on public.bank_transactions;
create trigger trg_bank_transactions_categorize_update
  after update of counterparty_iban, payment_reference on public.bank_transactions
  for each row execute function public.trg_fn_bank_transactions_categorize();

comment on trigger trg_bank_transactions_categorize_insert on public.bank_transactions is
  'Auto-categorizes a newly imported transaction the moment it lands, same "resolved before a '
  'human opens it" stance as trg_invoices_apply_rules_on_insert (migration 0031).';
comment on trigger trg_bank_transactions_categorize_update on public.bank_transactions is
  'Re-resolves the category when the counterparty IBAN or payment reference changes (e.g. a '
  'corrected import), same guard against overwriting a human-set value.';

-- ===========================================================================
-- 3. Human override RPC (no direct UPDATE policy exists on bank_transactions)
-- ===========================================================================
create or replace function public.opos_set_category(p_transaction_id uuid, p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bank_transactions
     set category_id     = p_category_id,
         category_source = case when p_category_id is null then null else 'human' end
   where id = p_transaction_id;
end;
$$;

comment on function public.opos_set_category(uuid, uuid) is
  'Human sets or clears a bank transaction''s category (offene-posten screen). Same SECURITY '
  'DEFINER shape as opos_set_no_receipt -- bank_transactions has SELECT-only RLS for authenticated '
  '(migration 0046). p_category_id null clears back to unresolved, ready to be re-suggested by the '
  'categorize trigger next time this row''s IBAN/reference changes. See migration 0057.';

grant execute on function public.opos_set_category(uuid, uuid) to authenticated;

-- ===========================================================================
-- 4. One-time backfill for existing rows
-- ===========================================================================
update public.bank_transactions t
   set category_id = sub.suggested, category_source = 'rule'
  from (
    select bt.id, public.resolve_transaction_category(bt.id) as suggested
      from public.bank_transactions bt
     where bt.category_id is null
  ) sub
 where sub.id = t.id
   and sub.suggested is not null;

-- ---------------------------------------------------------------------------
-- Self-check (run manually):
--
-- select category_source, count(*) from public.bank_transactions group by category_source;
-- -- 'rule' rows should be exactly the ones an IBAN-matched, category_id-carrying assignment_rule
-- -- covers; everything else stays NULL (genuinely unresolved, not defaulted).
commit;
