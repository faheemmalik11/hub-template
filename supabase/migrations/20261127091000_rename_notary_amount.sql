begin;

alter table public.bonus_settings rename column notary_amount to handover_bonus_amount;
alter table public.bonus_settings
    rename constraint bonus_settings_notary_amount_check to bonus_settings_handover_bonus_amount_check;

commit;
