begin;

drop function if exists public.invoices_filtered_search(public.vector, text, text, text, text, date, date, text, integer, text, numeric, numeric);
drop function if exists public.invoices_filtered_aggregate(text, text, text, text, date, date, text, text, numeric, numeric);

commit;
