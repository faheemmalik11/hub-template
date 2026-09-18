-- A bank account entered by hand has no BANKSapi connection behind it. bank_transactions dropped
-- the same NOT NULL in 0071; bank_accounts was missed, so every "Neues Konto" insert failed.

alter table public.bank_accounts alter column connection_id drop not null;
