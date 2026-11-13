-- What Lexware still shows as outstanding on a voucher it has not fully settled. Without it a
-- part payment is indistinguishable from no payment at all: the sync only ever wrote paid_at, and
-- only once the whole amount had arrived.

begin;

alter table public.documents
    add column if not exists lexoffice_open_amount numeric(14, 2);

commit;
