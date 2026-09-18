-- v_invoices_list gains has_suggested_bank_match / has_confirmed_bank_match, so the incoming-
-- invoice list can be filtered down to "a bank match is waiting for review".
--
-- Ported from immonetz, where these two columns and the `bankMatch` list filter already exist
-- (migrations 0054/0055 there). Until now a match suggestion was only visible on a DETAIL screen --
-- open the invoice, or open the bank transaction -- so there was no way to answer "which invoices
-- have a suggestion waiting for me?" without clicking through them one at a time.
--
-- Column semantics match immonetz exactly:
--   has_suggested_bank_match  status in ('kandidat','auto')  -- undecided, a human still has to act
--   has_confirmed_bank_match  status = 'bestaetigt'          -- already reconciled
-- 'auto' counts as SUGGESTED, not confirmed: the matcher writes it without asking, and the same
-- "still open" reading is what the detail screens use (see hasOpenMatch in $nr.tsx and `offen` in
-- components/bank/match-candidates.tsx). Treating it as confirmed here would hide exactly the rows
-- most worth reviewing.
--
-- Rebuilt by splicing into the view's OWN current definition rather than restating 3.6k characters
-- of it, which would be one transcription slip away from silently dropping a column the list reads.
-- `CREATE OR REPLACE VIEW` allows appending columns at the end but not reordering or removing them,
-- so this can only ever add. The anchor is the view's final expression, which is unique in the body.
do $$
declare
  v_def  text;
  v_cols text := E',\n    (exists (select 1 from public.invoice_transaction_matches m\n              where m.invoice_id = i.id and m.status = any (array[''kandidat'', ''auto'']))) as has_suggested_bank_match,\n    (exists (select 1 from public.invoice_transaction_matches m\n              where m.invoice_id = i.id and m.status = ''bestaetigt'')) as has_confirmed_bank_match';
  -- Two spellings, because the LIVE view has drifted from its tracked definition: migration 0055
  -- casts the score (`))::integer AS review_score`) while pg_get_viewdef on the live database
  -- returns the uncast form. Anchoring on only one meant this aborted the whole push on a fresh
  -- `supabase db reset`, a preview branch or a DR restore -- taking the next migration with it --
  -- while succeeding against production. Whichever spelling is present is the one used.
  v_anchor      text := E' END AS review_score\n   FROM invoices i';
  v_anchor_cast text := E'))::integer AS review_score\n   FROM invoices i';
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'v_invoices_list'
       and column_name = 'has_suggested_bank_match'
  ) then
    raise notice 'v_invoices_list already has the bank-match flags, nothing to do';
    return;
  end if;

  select pg_get_viewdef('public.v_invoices_list'::regclass, true) into v_def;

  if position(v_anchor in v_def) > 0 then
    v_def := replace(v_def, v_anchor, E' END AS review_score' || v_cols || E'\n   FROM invoices i');
  elsif position(v_anchor_cast in v_def) > 0 then
    v_def := replace(v_def, v_anchor_cast,
                     E'))::integer AS review_score' || v_cols || E'\n   FROM invoices i');
  else
    raise exception 'v_invoices_list: expected anchor not found, refusing to rebuild the view blind';
  end if;

  -- `with (security_invoker = true)` is NOT optional: Postgres replaces a view's reloptions
  -- wholesale on CREATE OR REPLACE VIEW, so omitting it silently clears what migration 0066 set and
  -- the view reverts to running as its owner -- an RLS bypass on every invoice. Learned the hard
  -- way on immonetz's v_trash.
  execute 'create or replace view public.v_invoices_list with (security_invoker = true) as ' ||
          rtrim(v_def, ';');
end $$;
