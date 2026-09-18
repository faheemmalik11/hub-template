-- OPOS whitelist: scope the writes, make a rule's effect reversible from inside the product, and
-- put the seeded notes into the language the screen is written in.
--
-- Audit: docs/audit/opos-whitelist/opos-whitelist/ISSUES.md #1, #3, #7, #8.

begin;

-- ---------------------------------------------------------------------------------------------
-- #7 -- the write hole. opos_whitelist_rules carries no company_id, so every rule is global by
-- construction, and the pipeline's own migration shipped
--     opos_whitelist_auth_insert ... with check (true)
--     opos_whitelist_auth_update ... using (true) with check (true)
-- for `authenticated`. Read back from pg_policies on all three projects before this migration was
-- written, so this is a live hole and not a reading of the migration text: an assistant restricted
-- to one company could add a rule that hides outgoing movements belonging to every company, and
-- could rewrite or deactivate a rule somebody else created.
--
-- Reads stay open to every authenticated user on purpose. "Why is this booking not in Offene
-- Posten?" is a question any bookkeeper has to be able to answer, and the answer is this list.
-- ---------------------------------------------------------------------------------------------

drop policy if exists "opos_whitelist_auth_insert" on public.opos_whitelist_rules;
drop policy if exists "opos_whitelist_auth_update" on public.opos_whitelist_rules;

create policy "opos_whitelist_insert" on public.opos_whitelist_rules
  for insert to authenticated
  with check (public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']));

-- Deleting a rule is a soft delete -- deleted_at/deleted_by stamped through an UPDATE -- so this
-- single policy governs editing, toggling and removing alike. There is deliberately no DELETE
-- policy: nothing in the product hard-deletes a rule, and the trash view restores from these rows.
create policy "opos_whitelist_update" on public.opos_whitelist_rules
  for update to authenticated
  using (public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']))
  with check (public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']));

-- ---------------------------------------------------------------------------------------------
-- #1 and #3 -- releasing what a rule hid, without leaving the product.
--
-- The screen told the user to run `pipeline/apply_opos_whitelist.py --revert`. No such file exists
-- in any of these repos, and a bookkeeping user could not run it if it did. The logic it stood in
-- for is already in the database: apply_opos_whitelist() releases a transaction back to 'offen'
-- the moment its rule stops matching. It simply never re-runs, because its trigger is
--     BEFORE INSERT OR UPDATE OF payment_reference, counterparty_holder, counterparty_iban,
--                                booking_text, amount
-- and deactivating or deleting a rule touches none of those columns. So the rows stay hidden,
-- pointing at a rule that is switched off or gone, with nothing on screen able to name it (#3).
--
-- This re-runs that same decision on demand, through the same matcher, for the rows one rule is
-- currently hiding. A row whose rule no longer matches falls to whichever other active rule does
-- match, or back to 'offen' when none does.
-- ---------------------------------------------------------------------------------------------

create or replace function public.opos_reapply_whitelist(p_rule_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_changed integer := 0;
begin
  -- Same gate as the policies above: this rewrites matching_status across every company.
  if not coalesce(
       public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']), false) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  with kandidaten as (
    select t.id, t.payment_reference, t.counterparty_holder, t.counterparty_iban, t.booking_text,
           t.no_receipt_set_by, t.no_receipt_set_at, t.whitelist_rule_id
      from public.bank_transactions t
     where t.matching_status = 'ignoriert'
       -- A non-null whitelist_rule_id is exactly what separates "a rule hid this" from "a person
       -- did" -- opos_set_no_receipt leaves the column null. A human decision must never be undone
       -- here, which is the same guard apply_opos_whitelist() applies for the same reason.
       -- 'zugeordnet' rows are excluded by the status filter, so a reconciled payment is untouched.
       and t.whitelist_rule_id is not null
       and (p_rule_id is null or t.whitelist_rule_id = p_rule_id)
  ),
  neu as (
    select k.*, m.rule_id as neue_regel, m.category as neue_kategorie
      from kandidaten k
      left join lateral public.match_opos_whitelist(
        k.payment_reference, k.counterparty_holder, k.counterparty_iban, k.booking_text) m on true
  )
  update public.bank_transactions t
     set matching_status   = case when n.neue_regel is null then 'offen' else 'ignoriert' end,
         no_receipt_reason = n.neue_kategorie,
         whitelist_rule_id = n.neue_regel,
         no_receipt_set_by = case when n.neue_regel is null
                                  then null else coalesce(n.no_receipt_set_by, 'system') end,
         no_receipt_set_at = case when n.neue_regel is null
                                  then null else coalesce(n.no_receipt_set_at, now()) end
    from neu n
   where t.id = n.id
     and n.neue_regel is distinct from n.whitelist_rule_id;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

-- None of the columns written above are in trg_apply_opos_whitelist's UPDATE OF list, so this does
-- not re-enter the trigger and re-decide the row a second time.
revoke all on function public.opos_reapply_whitelist(uuid) from public;
grant execute on function public.opos_reapply_whitelist(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- #8 -- the seeded notes are English developer text rendered verbatim in the Notiz column of a
-- German screen, which CLAUDE.md's language rule excludes ("if a string is rendered to the user ->
-- German"). Two of them ("Seen in dev: ...") described the development process rather than the
-- rule. All 21 distinct values are identical across the three projects.
--
-- Matched on the exact seed text, so a note somebody has since edited by hand is left alone.
-- ---------------------------------------------------------------------------------------------

update public.opos_whitelist_rules r
   set note = v.de
  from (values
    ('ATM / counter cash withdrawal',                      'Bargeldabhebung am Automaten oder Schalter'),
    ('ATM withdrawal',                                     'Bargeldabhebung am Automaten'),
    ('Seen in dev: ATM withdrawal booking text',           'Buchungstext einer Automatenabhebung'),
    ('Standard German bank fee booking text',              'Üblicher Buchungstext für Bankgebühren'),
    ('Bank quarterly fee posting',                         'Quartalsabschluss der Bankgebühren'),
    ('Bank fee, no supplier invoice',                      'Bankgebühr, keine Lieferantenrechnung'),
    ('Seen in dev booking texts',                          'Kommt so in Buchungstexten vor'),
    ('Seen in dev booking texts (also spelled with ä)',    'Kommt so in Buchungstexten vor, auch mit ä geschrieben'),
    ('Seen in dev: "Uebertrag auf Girokonto"',             'Kommt als „Uebertrag auf Girokonto“ vor'),
    ('Umlaut spelling',                                    'Schreibweise mit Umlaut'),
    ('Umlaut spelling of the same booking text',           'Schreibweise desselben Buchungstexts mit Umlaut'),
    ('Briefing Screen 10: loan installments',              'Darlehensraten (Briefing Screen 10)'),
    ('Briefing Screen 10 (covers Darlehenszinsen too)',    'Briefing Screen 10, deckt auch Darlehenszinsen ab'),
    ('Briefing Screen 10: rebookings never have a receipt','Umbuchungen haben nie einen Beleg (Briefing Screen 10)'),
    ('Briefing Screen 10: salaries never have a receipt',  'Löhne und Gehälter haben nie einen Beleg (Briefing Screen 10)'),
    ('Briefing Screen 10: taxes never have a receipt',     'Steuern haben nie einen Beleg (Briefing Screen 10)'),
    ('Briefing Screen 10 + Appendix A3',                   'Briefing Screen 10 und Anhang A3'),
    ('Briefing Appendix A3 (deposit)',                     'Briefing Anhang A3 (Einlage)'),
    ('Appendix A3 taxes',                                  'Steuern (Briefing Anhang A3)'),
    ('Payroll side costs, no supplier invoice',            'Lohnnebenkosten, keine Lieferantenrechnung'),
    ('VAT payment — pass-through, no receipt',             'Umsatzsteuer-Zahlung, durchlaufender Posten ohne Beleg')
  ) as v(en, de)
 where r.note = v.en;

commit;
