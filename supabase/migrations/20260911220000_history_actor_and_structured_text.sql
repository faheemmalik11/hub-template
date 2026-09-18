-- Two things about the rows the paid trigger writes into invoice_history.
--
-- 1. WHO. The trigger hardcodes actor 'system'. It is a trigger, so that felt right, but it is
--    wrong from the reader's side: somebody unlinks a bank match, the payment is withdrawn as a
--    direct consequence, and the history credits that to "system" one line under their own name.
--    Nothing in the trail then connects the effect to the person who caused it.
--
--    auth.jwt() is populated whenever the write came from a signed-in session, and empty when the
--    pipeline or a cron did it. So the actor becomes "the person if there was one, system if there
--    genuinely was not", which is what the column was always meant to say.
--
-- 2. WHAT, in a form that can be translated. These rows carry German prose in `text` and nothing
--    in `data`, so the Notes & History tab has nothing to render from and shows German even when
--    the reader picked English. The sentence stays exactly as it was (an audit trail should not
--    change wording later, and old rows must keep reading the same), and the same facts are now
--    ALSO written as data. The screen renders from `data` when it is there and falls back to the
--    stored sentence when it is not.

begin;

create or replace function public.sync_invoice_paid_from_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice   uuid := coalesce(new.invoice_id, old.invoice_id);
  v_gross     numeric;
  v_matched   numeric;
  v_paydate   date;
  v_paid_at   timestamptz;
  v_source    text;
  v_shortfall numeric;
  -- The person, when a person did it. Empty for the pipeline and for cron.
  v_actor     text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');
begin
  select abs(amount_gross), paid_at, paid_source
    into v_gross, v_paid_at, v_source
    from public.invoices where id = v_invoice;
  if not found then
    return null;
  end if;

  select coalesce(sum(m.amount_matched), 0), max(t.booking_date)
    into v_matched, v_paydate
    from public.invoice_transaction_matches m
    join public.bank_transactions t on t.id = m.transaction_id
   where m.invoice_id = v_invoice and m.status = 'bestaetigt';

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    if v_paid_at is null then
      update public.invoices
         set paid_at     = coalesce(v_paydate::timestamptz, now()),
             paid_source = 'bank_match',
             updated_at  = now()
       where id = v_invoice;

      v_shortfall := v_gross - v_matched;
      insert into public.invoice_history (invoice_id, type, text, actor, data)
      values (
        v_invoice,
        'aenderung',
        -- Unchanged wording. Persisted audit text stays German.
        case when v_shortfall > 0.01
          then format('Als bezahlt markiert (bestätigter Bankabgleich, Skonto %s EUR)',
                      to_char(v_shortfall, 'FM999G999G990D00'))
          else 'Als bezahlt markiert (bestätigter Bankabgleich)'
        end,
        v_actor,
        jsonb_strip_nulls(jsonb_build_object(
          'event', 'paid_from_match',
          'skonto', case when v_shortfall > 0.01 then v_shortfall end
        ))
      );
    end if;
  else
    if v_paid_at is not null and v_source = 'bank_match' then
      update public.invoices
         set paid_at     = null,
             paid_source = null,
             updated_at  = now()
       where id = v_invoice;

      insert into public.invoice_history (invoice_id, type, text, actor, data)
      values (
        v_invoice,
        'aenderung',
        format('Zahlung zurückgenommen: Bankabgleich deckt nur noch %s von %s EUR',
               to_char(v_matched, 'FM999G999G990D00'),
               to_char(v_gross, 'FM999G999G990D00')),
        v_actor,
        jsonb_build_object(
          'event', 'payment_withdrawn',
          'matched', v_matched,
          'gross', v_gross
        )
      );
    end if;
  end if;

  return null;
end $$;

commit;
