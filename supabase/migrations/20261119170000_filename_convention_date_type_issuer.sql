-- A second naming convention, the one a client asked for in November 2026:
-- 2026_11_16_Rechnung_ContentWerkRuhr_Steinmetzstrasse_2 -- date, what the document is, who sent
-- it, and the property when there is one. It reverses the earlier rule that kept the document type
-- out of the name because the folder implied it.
--
-- Named conventions rather than more booleans, because the ingestion pipeline already models it
-- that way (one module per convention, picked by name) and reads this same row. date_separator is
-- a field that pipeline already looks for and the Hub never had.
--
-- Default stays the convention every existing client already files under, so nobody's names change
-- until they pick the new one.

begin;

alter table public.filename_settings
    add column if not exists convention text not null default 'code_and_amount',
    add column if not exists date_separator text not null default '_',
    add column if not exists default_type_label text not null default 'Beleg';

alter table public.filename_settings
    drop constraint if exists filename_settings_convention_known;

alter table public.filename_settings
    add constraint filename_settings_convention_known
        check (convention in ('code_and_amount', 'date_type_issuer'));

commit;
