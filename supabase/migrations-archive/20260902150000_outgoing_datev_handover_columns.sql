-- Outgoing invoices: the two columns a DATEV handover needs before it can safely send one.
--
-- WHY THIS IS NOT ENOUGH ON ITS OWN, stated up front so nobody applies it and expects the feature.
-- Two things block outgoing handover, and this migration only removes the first:
--
--   1. (this file) Nothing recorded that an outgoing invoice had already been handed over, so a
--      second run would email the tax advisor the same invoice again. The send cannot be recalled
--      and DATEV has no return channel, so a duplicate is not something anyone finds out about.
--   2. (not this file) There are no files. `outgoing_invoice_files` is empty on Immonetz DEV while
--      60 live outgoing invoices exist, all `source='upload'`. Every one of them blocks as "no
--      file" and there is nothing to attach.
--
-- Mirrors migration 0038's treatment of `invoices` exactly, minus the workflow trigger: incoming
-- invoices advance `workflow_status` to 'uebergeben_datev' on handover, and outgoing invoices have
-- no equivalent workflow column (`voucher_status` mirrors LexOffice and must not be written here).
--
-- Idempotent and seeds nothing. Applying it changes no behaviour by itself: the UI's outgoing block
-- stays informational until `triggerDatevHandover` stops throwing NOT_IMPLEMENTED for 'outgoing',
-- and that is a separate change that should not land before point 2 above is solved.

begin;

alter table public.outgoing_invoices
  add column if not exists datev_handed_over_at timestamptz;

alter table public.outgoing_invoices
  add column if not exists datev_batch_id uuid references public.datev_handover_batches(id);

comment on column public.outgoing_invoices.datev_handed_over_at is
  'Set once this invoice has been emailed to the DATEV upload address. The guard against sending it twice; written only after the send is confirmed, never before.';

comment on column public.outgoing_invoices.datev_batch_id is
  'Which datev_handover_batches row carried this invoice.';

-- The batches table already accepts direction 'outgoing' (migration 0038 plus
-- 20260815130000_datev_routes_other_direction), so nothing to widen here.

commit;
