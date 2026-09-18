-- Pleo spend had no bank_accounts row, so it appeared nowhere on the Bankkonten screen and in no
-- account filter, even though 2097 transactions were importing correctly.

insert into public.bank_accounts (
  account_name, product_type, currency, is_own_account, is_sandbox, name_is_custom, metadata
)
select 'Pleo', 'KREDITKARTE', 'EUR', true, false, true, jsonb_build_object('source', 'pleo')
where not exists (
  select 1 from public.bank_accounts where metadata ->> 'source' = 'pleo'
);

update public.bank_transactions
   set account_id = (
     select id from public.bank_accounts where metadata ->> 'source' = 'pleo' limit 1
   )
 where source = 'pleo'
   and account_id is null;
