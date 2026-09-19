-- The bank-match KPI filter becomes a true partition, matching the list.
--
-- invoices_kpis tested 'vorschlag' as `has_suggested_bank_match` alone. invoice_transaction_matches
-- is m:n and confirming one candidate does NOT withdraw its siblings (they stay 'kandidat'), so an
-- invoice can carry a confirmed match AND an open one. Under the old test it was counted by both
-- 'vorschlag' and 'zugeordnet', the three filtered counts did not sum to the unfiltered total, and
-- the tiles disagreed with the list once the list was corrected to exclude confirmed rows.
--
-- After this, every invoice falls in exactly one of: offen / vorschlag / zugeordnet.
--
-- Spliced from the live definition rather than restated -- the body carries a dozen other filter
-- clauses the tiles must keep applying. The lookup is narrowed to a single overload and asserts as
-- much: SELECT INTO without STRICT silently picks an arbitrary row when several match, which would
-- rewrite (or skip) the wrong function without a word.
do $$
declare
  v_def   text;
  v_count int;
  v_from  text := '      or (p_bank_match = ''vorschlag''  and has_suggested_bank_match)';
  v_to    text := '      or (p_bank_match = ''vorschlag''  and has_suggested_bank_match and not has_confirmed_bank_match)';
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  if v_count <> 1 then
    raise exception 'invoices_kpis: expected exactly 1 overload, found %', v_count;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';

  if position('and not has_confirmed_bank_match)' in v_def) > 0
     and position(v_from in v_def) = 0 then
    raise notice 'invoices_kpis already partitions the bank-match values, nothing to do';
    return;
  end if;

  if position(v_from in v_def) = 0 then
    raise exception 'invoices_kpis: expected vorschlag clause not found, refusing to rewrite blind';
  end if;

  execute replace(v_def, v_from, v_to);
end $$;
