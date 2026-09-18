-- One link_invoice_transaction, and a trigger that can actually call it.
--
-- WHY. Three overloads were live at once:
--
--   0030                  (uuid, uuid, numeric, jsonb)
--   0037                  (uuid, uuid, numeric, jsonb, numeric)
--   20260910170000        (uuid, uuid, numeric, jsonb, numeric, text)
--
-- `create or replace function` with a DIFFERENT signature adds a function, it does not replace the
-- old one, so each migration that grew a parameter left the previous version behind. Nothing
-- noticed because PostgREST resolves overloads by argument NAME and the app always sends all six.
--
-- A positional call from SQL has no such luck. The trigger added in 20260911190000 called
--
--   perform public.link_invoice_transaction(new.id, new.uploaded_for_transaction_id);
--
-- and got `function public.link_invoice_transaction(uuid, uuid) is not unique`, so an invoice
-- uploaded from a transaction was never linked. The trigger's own exception handler recorded the
-- reason on the invoice, which is how this was found rather than lost.
--
-- SAFE TO DROP. The only caller is the Hub's useLinkInvoiceTransaction, which sends
-- p_invoice_id, p_transaction_id, p_score, p_reasons, p_amount and p_difference_reason, so it
-- resolves to the six-argument version either way. The book-keeping pipeline does not call it at
-- all. The four- and five-argument versions have no callers left in any repo.

begin;

drop function if exists public.link_invoice_transaction(uuid, uuid, numeric, jsonb);
drop function if exists public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric);

-- Named notation, so this keeps working even if somebody adds a seventh parameter later. The
-- positional form is what broke, and it would break again the same way.
create or replace function public.link_uploaded_invoice_when_extracted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
begin
  if new.uploaded_for_transaction_id is null then
    return null;
  end if;
  -- Nothing to allocate against yet. Extraction has not run, or it ran and found no total.
  if new.amount_gross is null or new.amount_gross = 0 then
    return null;
  end if;
  -- `after update of amount_gross` also fires when the column is merely present in the SET list,
  -- so the transition itself has to be checked rather than assumed.
  if old.amount_gross is not distinct from new.amount_gross then
    return null;
  end if;
  -- Already linked. link_invoice_transaction would re-stamp it happily, but re-running it can also
  -- raise once the remainders have moved on, and there is nothing to gain by trying.
  if exists (
    select 1 from public.invoice_transaction_matches
     where invoice_id = new.id
       and transaction_id = new.uploaded_for_transaction_id
       and status = 'bestaetigt'
  ) then
    return null;
  end if;

  -- WRAPPED, because this runs inside the pipeline's own UPDATE. A raise here would roll that back
  -- and the extraction result would be lost, which is a far worse outcome than an unlinked invoice.
  -- The reason is written where somebody will see it rather than swallowed.
  begin
    perform public.link_invoice_transaction(
      p_invoice_id        => new.id,
      p_transaction_id    => new.uploaded_for_transaction_id,
      p_score             => null,
      p_reasons           => jsonb_build_object('uploaded_for_transaction', true),
      p_amount            => null,
      p_difference_reason => null
    );

    select amount_matched into v_amount
      from public.invoice_transaction_matches
     where invoice_id = new.id and transaction_id = new.uploaded_for_transaction_id;

    insert into public.invoice_history (invoice_id, type, text, actor)
    values (
      new.id, 'aenderung',
      -- Persisted audit text stays German.
      'Automatisch der Banktransaktion zugeordnet, aus der die Rechnung hochgeladen wurde ('
        || to_char(coalesce(v_amount, 0), 'FM999G999G990D00') || ' EUR).',
      'hub'
    );
  exception when others then
    insert into public.invoice_history (invoice_id, type, text, actor)
    values (
      new.id, 'aenderung',
      'Automatische Zuordnung zur Banktransaktion nicht möglich: ' || sqlerrm,
      'hub'
    );
  end;

  return null;
end $$;

commit;
