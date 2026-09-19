-- Upload an invoice from a bank transaction, and link the two once it has been read.
--
-- H9 part 3 from the 09.09.2026 meeting. Saskia called a payment with no document a dead end:
-- there was a "no invoice" option at the top and no way to actually supply one.
--
-- WHY THIS IS NOT JUST AN UPLOAD. The upload half already works: the Hub writes the invoice with
-- intake_channel 'upload', and the book-keeping cron picks up anything matching
-- `intake_channel = 'upload' and extracted is null`, reads it, and fills in supplier, amount and
-- date. What is missing is the connection back to the payment the person was standing on.
--
-- It cannot be made at upload time. link_invoice_transaction allocates against the invoice total:
--
--   if v_inv_gross is null or v_inv_gross = 0 then
--     raise exception 'link_invoice_transaction: invoice % has no gross amount to allocate against'
--
-- and a fresh upload has no amount until extraction runs, which is asynchronous and up to two
-- hours later. So the intent is recorded now and the link is made when the amount arrives.
--
-- NOT LEFT TO THE MATCHER. Rediscovering the pair later is what happens today, and it is exactly
-- what fails: the amount on a photographed receipt often does not agree with the payment, which is
-- why the document was missing in the first place. The person uploading already knows the answer,
-- so the answer is stored rather than guessed at again.

begin;

alter table public.invoices
  add column if not exists uploaded_for_transaction_id uuid
    references public.bank_transactions(id) on delete set null;

comment on column public.invoices.uploaded_for_transaction_id is
  'The bank transaction this invoice was uploaded from, if it was uploaded from one. Read by '
  'link_uploaded_invoice_when_extracted once the amount is known. Kept after linking as a record '
  'of where the document came from.';

-- Small by construction: only uploads made from a transaction, and only until they are read.
create index if not exists invoices_uploaded_for_transaction_idx
  on public.invoices (uploaded_for_transaction_id)
  where uploaded_for_transaction_id is not null;

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
    perform public.link_invoice_transaction(new.id, new.uploaded_for_transaction_id);

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

drop trigger if exists invoices_link_uploaded_for_transaction on public.invoices;
create trigger invoices_link_uploaded_for_transaction
  after update of amount_gross on public.invoices
  for each row
  execute function public.link_uploaded_invoice_when_extracted();

commit;
