-- A person marked it paid, so the history should say who.
--
-- advance_workflow_on_payment() writes the one history row that records an invoice reaching
-- 'bezahlt', and it hardcoded actor = 'system'. That is right for the bank reconciliation, which
-- genuinely is a background match, and wrong for the manual switch on the Zahlung tab, which is a
-- person asserting that money moved. Every other row in invoice_history carries the acting user's
-- email (insertVerlauf() in lib/data/queries.ts reads it from the session), so a chain that reads
-- "Bezahlt — system" next to eleven rows naming real people reads as if nobody did it.
--
-- Two changes, both inside the existing function -- no new trigger, no schema change:
--
--   1. actor is coalesce(auth.jwt() ->> 'email', 'system'). The trigger is SECURITY DEFINER but
--      still runs inside the caller's transaction, so the request's JWT is in scope. A genuine
--      background write -- bank-sync and payment-callback both use the service role, which has no
--      user JWT -- yields NULL and falls back to 'system', which is what those rows should say.
--
--   2. `data` now carries {nach, paid_source}. The row had no data at all, so the detail page's
--      verlaufZielStatus() had to recover the target status by parsing the German audit sentence,
--      and the MANNER of payment was stranded in that sentence where no reader ever saw it: the
--      timeline titles each row by its target state, so all three payment routes rendered as a
--      bare "Bezahlt". Storing paid_source lets the row say which one it was.
--
-- The audit text is unchanged and still German, matching every other persisted history sentence.

begin;

create or replace function public.advance_workflow_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
  v_actor text;
begin
  if new.paid_at is not null and old.paid_at is null
     and new.workflow_status in (
       'eingegangen', 'in_pruefung', 'rueckfrage',
       'freigegeben_assistenz', 'freigegeben_vorgesetzter'
     )
  then
    v_text := case new.paid_source
      when 'bank_match' then 'Workflow: Bezahlt (Bankabgleich bestätigt)'
      when 'manual' then 'Workflow: Bezahlt (manuell markiert)'
      else 'Workflow: Bezahlt'
    end;

    -- nullif guards the empty-string case: a JWT with no email claim would otherwise be recorded
    -- as an actor of '', which reads as a blank line rather than as the system.
    v_actor := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');

    update public.invoices
       set workflow_status = 'bezahlt', updated_at = now()
     where id = new.id;

    insert into public.invoice_history (invoice_id, type, text, actor, data)
    values (
      new.id,
      'bezahlt',
      v_text,
      v_actor,
      jsonb_build_object('nach', 'bezahlt', 'paid_source', new.paid_source)
    );
  end if;
  return null;
end;
$$;

commit;
