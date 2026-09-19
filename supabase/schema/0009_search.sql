-- Full text search, in whatever language this client reads.
--
-- THE REASON THIS IS ITS OWN FILE. A search column is the one place a schema cannot stay language
-- free: `to_tsvector('german', ...)` names a language in the column definition, and a generated
-- column cannot read a setting at run time. So the language is applied here, once, from one place a
-- client sets, rather than baked into 0004 where every other client would inherit it.
--
-- Change TEXT_SEARCH_LANGUAGE below for a client that does not read German, then re-run this file.
-- It is the only line in the schema that has an opinion about language.

begin;

do $$
declare
    -- Any configuration Postgres ships: simple, english, german, french, dutch, and so on.
    text_search_language text := 'german';
begin
    if not exists (select 1 from pg_ts_config where cfgname = text_search_language) then
        raise exception 'unknown text search configuration %; pick one from pg_ts_config', text_search_language;
    end if;

    execute format($fmt$
        alter table public.documents
            add column if not exists fts tsvector generated always as (
                setweight(to_tsvector(%L::regconfig,
                    coalesce(invoice_number, '') || ' ' || coalesce(issuer, '')), 'A')
                ||
                setweight(to_tsvector(%L::regconfig,
                    coalesce(service_description, '') || ' ' || coalesce(ocr_fulltext, '')), 'B')
            ) stored
    $fmt$, text_search_language, text_search_language);

    execute format($fmt$
        alter table public.bank_transactions
            add column if not exists fts tsvector generated always as (
                to_tsvector(%L::regconfig,
                    coalesce(payment_reference, '') || ' ' ||
                    coalesce(booking_text, '') || ' ' ||
                    coalesce(counterparty_holder, ''))
            ) stored
    $fmt$, text_search_language);
end
$$;

-- The embedding a question is compared against. Nullable: nothing breaks when it is never filled.
alter table public.documents add column if not exists embedding public.vector(1536);

create index if not exists documents_fts on public.documents using gin (fts);
create index if not exists bank_transactions_fts on public.bank_transactions using gin (fts);

-- Names are searched as people type them, which is rarely how they are spelled.
create index if not exists suppliers_name_trgm on public.suppliers using gin (name gin_trgm_ops);
create index if not exists customers_name_trgm on public.customers using gin (name gin_trgm_ops);
create index if not exists companies_name_trgm on public.companies using gin (name gin_trgm_ops);

commit;
