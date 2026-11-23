begin;

drop view if exists public.v_bank_transactions_list;
create view public.v_bank_transactions_list with (security_invoker = true) as
select t.*,
       a.account_name,
       a.iban as account_iban,
       a.bank_name as account_bank_name,
       exists (
         select 1 from public.document_transaction_matches m
          where m.transaction_id = t.id and m.status in ('candidate', 'auto')
       ) as has_suggested_match,
       exists (
         select 1 from public.document_transaction_matches m
          where m.transaction_id = t.id and m.status = 'confirmed'
       ) as has_confirmed_match
  from public.bank_transactions t
  left join public.bank_accounts a on a.id = t.account_id
 where t.deleted_at is null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_bank_transactions_list'
       and column_name = 'is_demo'
  ) then
    raise exception '0092 self-check failed: v_bank_transactions_list still hides is_demo';
  end if;
end
$$;

commit;
