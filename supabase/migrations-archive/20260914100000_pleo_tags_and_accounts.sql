-- Pleo's own classification, mirrored so the Hub can stop asking for it twice.
--
-- WHY. Saskia, Stäy meeting 09.09.2026 (13:03): "almost everything is already available here in
-- Pleo. Then we could completely avoid doing the assignments again." The employee already sets the
-- receipt, the category and the property in Pleo; the Hub showed none of it, so the same work was
-- done a second time.
--
-- WHAT THE LIVE DATA SAYS. Sampled over 1.000 rows of bank_transactions.raw_data on 14.09.2026:
--
--   the property   `tags[].tagId`, one tag per entry, on 573 of the 600 most recent rows.
--                  Pleo's docs call a tag "a cost centre ... to associate each expense with a cost
--                  object", which is Saskia's model exactly. 13 distinct values against her 15
--                  properties.
--   the category   `accountId`, on 98 percent of rows, 14 distinct values.
--
-- Two traps the sample exposed. The tag GROUP has changed over time (older entries carry
-- 9b750613..., current ones d1a07cb2...), so nothing may key on the group. And the newest entries
-- of a day are untagged because the employee has not finished them yet, so a coverage check run on
-- "the last few rows" reads as zero.
--
-- WHY NOT WRITE STRAIGHT ONTO THE TRANSACTION. mapEntry() in pleo-sync only ever writes fields Pleo
-- owns, because an upsert writes every column it is given and a re-sync would otherwise flatten
-- whatever a person had set here. Pleo's ids ARE Pleo-owned, so they go on the transaction; what
-- they MEAN in the Hub is a mapping a person controls, so it lives on these tables instead.

begin;

-- ---------------------------------------------------------------------------
-- 1. The two lists, mirrored from Pleo, plus the Hub meaning of each row.
-- ---------------------------------------------------------------------------
create table if not exists public.pleo_tags (
  id           uuid primary key,          -- Pleo's tagId, not ours
  group_id     uuid not null,
  name         text,
  code         text,
  archived     boolean not null default false,
  -- WHAT IT MEANS HERE. Null until somebody says. Never guessed: a receipt filed against the wrong
  -- property is a wrong number in the tax adviser's books, not a cosmetic mismatch.
  property_id  uuid references public.properties(id),
  -- Set when a tag deliberately means "no property", the Pleo end of Gemeinkosten.
  is_overhead  boolean not null default false,
  synced_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pleo_tags_overhead_xor_property check (not (is_overhead and property_id is not null))
);

comment on table public.pleo_tags is
  'Pleo tag values mirrored from GET /v0/tag-groups/{group}/tags, with the Hub property each one '
  'means. Archived tags are kept: a 2022 entry still carries the tag it was given.';

create index if not exists pleo_tags_group_idx on public.pleo_tags (group_id);
create index if not exists pleo_tags_property_idx on public.pleo_tags (property_id)
  where property_id is not null;

create table if not exists public.pleo_accounts (
  id           uuid primary key,          -- Pleo's accountId
  code         text,
  name         text,
  archived     boolean not null default false,
  external_id  text,
  -- The Hub's BWA category this Pleo account books to. Same rule: null until somebody says.
  category_id  uuid references public.bwa_categories(id),
  synced_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.pleo_accounts is
  'Pleo chart of accounts mirrored from POST /v1/chart-of-accounts:search, with the BWA category '
  'each account maps to. `accountId` on an accounting entry points at one of these.';

create index if not exists pleo_accounts_category_idx on public.pleo_accounts (category_id)
  where category_id is not null;

-- ---------------------------------------------------------------------------
-- 2. What Pleo said, on the transaction itself.
--
--    Provider-owned, so pleo-sync may write them on every run without the rule in mapEntry() being
--    broken. The Hub's own category_id and property columns stay untouched by the sync.
-- ---------------------------------------------------------------------------
alter table public.bank_transactions
  add column if not exists pleo_tag_id     uuid,
  add column if not exists pleo_account_id uuid;

comment on column public.bank_transactions.pleo_tag_id is
  'The tag Pleo carries for this entry (its cost centre, for Stäy the property). Resolve through '
  'pleo_tags to a Hub property. Provider-owned: rewritten on every sync.';
comment on column public.bank_transactions.pleo_account_id is
  'The chart-of-accounts line Pleo carries for this entry. Resolve through pleo_accounts to a BWA '
  'category. Provider-owned: rewritten on every sync.';

create index if not exists bank_transactions_pleo_tag_idx on public.bank_transactions (pleo_tag_id)
  where pleo_tag_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Backfill both from what is already stored.
--
--    Nothing has to be re-fetched: pleo-sync has been keeping the whole entry in raw_data since it
--    was written, so every historical transaction already carries these ids.
-- ---------------------------------------------------------------------------
update public.bank_transactions
   set pleo_account_id = nullif(raw_data ->> 'accountId', '')::uuid
 where source = 'pleo'
   and pleo_account_id is null
   and nullif(raw_data ->> 'accountId', '') is not null;

-- One tag per entry in this data. jsonb_array_elements on the first element rather than an
-- aggregate, so an entry that somehow carries two does not silently pick an arbitrary one: it
-- takes the first, which is what the UI would show anyway.
update public.bank_transactions t
   set pleo_tag_id = sub.tag_id
  from (
    select b.id,
           (jsonb_array_elements(b.raw_data -> 'tags') ->> 'tagId')::uuid as tag_id
      from public.bank_transactions b
     where b.source = 'pleo'
       and jsonb_typeof(b.raw_data -> 'tags') = 'array'
       and jsonb_array_length(b.raw_data -> 'tags') > 0
  ) sub
 where t.id = sub.id
   and t.pleo_tag_id is null;

-- ---------------------------------------------------------------------------
-- 4. Let the sync actually deliver them.
--
--    upsert_external_transactions has an EXPLICIT column list (migrations 0073, 0082,
--    20260901190000). A field pleo-sync adds to its row object and the RPC does not know about is
--    accepted, ignored and lost without an error, which is how a "written" column stays null
--    forever. Both new ids are added here, in the same shape as the columns around them.
--
--    Unchanged otherwise, including the raw_data merge and the coalesce on spender/account.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_external_transactions(p_rows jsonb, p_account_id uuid default null)
returns table (inserted_count int, updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_external_transactions: p_rows must be a JSON array';
  end if;

  with incoming as (
    select
      r->>'source'              as source,
      r->>'external_id'         as external_id,
      (r->>'amount')::numeric   as amount,
      r->>'currency'            as currency,
      nullif(r->>'booking_date','')::date as booking_date,
      nullif(r->>'value_date','')::date   as value_date,
      r->>'booking_text'        as booking_text,
      r->>'payment_reference'   as payment_reference,
      r->>'counterparty_holder' as counterparty_holder,
      r->>'counterparty_iban'   as counterparty_iban,
      r->>'counterparty_bic'    as counterparty_bic,
      nullif(trim(coalesce(r->>'spender_name','')),'')  as spender_name,
      nullif(trim(coalesce(r->>'spender_email','')),'') as spender_email,
      nullif(r->>'pleo_tag_id','')::uuid     as pleo_tag_id,
      nullif(r->>'pleo_account_id','')::uuid as pleo_account_id,
      coalesce((r->>'is_sandbox')::boolean, false) as is_sandbox,
      r->>'transaction_type'    as transaction_type,
      coalesce(r->>'transaction_type_source','auto') as transaction_type_source,
      coalesce(r->'raw_data','{}'::jsonb) as raw_data,
      p_account_id as account_id
    from jsonb_array_elements(p_rows) as r
  ),
  deduped as (
    select distinct on (source, external_id) *
      from incoming
     where external_id is not null and source is not null
     order by source, external_id
  ),
  upserted as (
    insert into public.bank_transactions as bt (
      source, external_id, amount, currency, booking_date, value_date,
      booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
      spender_name, spender_email, pleo_tag_id, pleo_account_id,
      is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
    )
    select source, external_id, amount, currency, booking_date, value_date,
           booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
           spender_name, spender_email, pleo_tag_id, pleo_account_id,
           is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
      from deduped
    on conflict (source, external_id) do update set
      amount              = excluded.amount,
      currency            = excluded.currency,
      booking_date        = excluded.booking_date,
      value_date          = excluded.value_date,
      booking_text        = excluded.booking_text,
      payment_reference   = excluded.payment_reference,
      counterparty_holder = excluded.counterparty_holder,
      counterparty_iban   = excluded.counterparty_iban,
      counterparty_bic    = excluded.counterparty_bic,
      spender_name        = coalesce(excluded.spender_name, bt.spender_name),
      spender_email       = coalesce(excluded.spender_email, bt.spender_email),
      -- coalesce, like spender: a manual import carries neither, and plain assignment would wipe
      -- what the Pleo sync had already established for that same transaction.
      pleo_tag_id         = coalesce(excluded.pleo_tag_id, bt.pleo_tag_id),
      pleo_account_id     = coalesce(excluded.pleo_account_id, bt.pleo_account_id),
      is_sandbox          = excluded.is_sandbox,
      transaction_type    = excluded.transaction_type,
      account_id          = coalesce(excluded.account_id, bt.account_id),
      raw_data            = coalesce(bt.raw_data, '{}'::jsonb) || excluded.raw_data
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return query select v_inserted, v_updated;
end $$;

revoke all on function public.upsert_external_transactions(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.upsert_external_transactions(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS. Readable by anyone signed in, mapping editable by anyone signed in, matching
--    property_companies' own openness (migration 0084) -- the person who knows which tag is which
--    property is the bookkeeper, not an admin.
-- ---------------------------------------------------------------------------
alter table public.pleo_tags     enable row level security;
alter table public.pleo_accounts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pleo_tags', 'pleo_accounts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                   t || '_update', t);
  end loop;
end $$;

-- INSERT and DELETE stay closed to the client on purpose: the rows are Pleo's list, written by the
-- pleo-master-data function through the service role. A person edits the mapping, never the list.

commit;

-- Sanity after the master-data function has run once:
--   select count(*) from pleo_tags;                                         -- one per Pleo tag
--   select count(*) from pleo_accounts;                                     -- 14 expected
--   select count(*) from bank_transactions where pleo_tag_id is not null;   -- most Pleo rows
--   select t.name, count(*) from bank_transactions b
--     join pleo_tags t on t.id = b.pleo_tag_id group by 1 order by 2 desc;
