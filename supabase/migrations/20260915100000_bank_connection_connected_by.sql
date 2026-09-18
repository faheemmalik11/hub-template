-- Record who connected a bank.
--
-- WHY. A BANKSapi consent belongs to the person who authorised it at their own bank, with their own
-- login and TAN. The Hub keeps one connection per consent and shows it to everyone, but never wrote
-- down whose it was. When a consent expires (PSD2 consents lapse, typically after 90 days) the row
-- turns to 'expired' and nobody can tell from the Hub who has to renew it. It matters now because a
-- second person connects their own card: Andreas's Sparkasse Mastercard sits under his private bank
-- login, not Saskia's, so "ask Saskia" is no longer the answer for every bank.
--
-- TWO COLUMNS, ON PURPOSE. `connected_by` points at the account, so the name shown is the live one.
-- `connected_by_email` is written alongside it, so the answer survives the account being deactivated
-- or removed, which is exactly when somebody later asks whose consent it was.
--
-- NO BACKFILL. The connections that exist today were made before this was recorded, and guessing a
-- name would be worse than showing that it is not known. The screen says "nicht erfasst" for them.

begin;

alter table public.bank_connections
  add column if not exists connected_by       uuid,
  add column if not exists connected_by_email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bank_connections_connected_by_fkey') then
    alter table public.bank_connections
      add constraint bank_connections_connected_by_fkey
      foreign key (connected_by) references public.app_users (id) on delete set null;
  end if;
end $$;

comment on column public.bank_connections.connected_by is
  'The Hub account that started this bank connection, and so whose consent it is to renew. Written '
  'by bank-connect. Null on connections made before 15.09.2026.';
comment on column public.bank_connections.connected_by_email is
  'Email of connected_by at the time, kept so the answer survives that account being removed.';

commit;
