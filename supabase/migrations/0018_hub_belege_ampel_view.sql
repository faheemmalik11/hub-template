-- 0015_belege_ampel_view.sql
-- Surface the pipeline's recognition traffic light ("Ampel") on the list/Kanban screens.
--
-- The extraction pipeline added three columns to belege:
--   ampel            text     -- 'gruen' | 'gelb' | 'rot'  (recognition traffic light, A2/A6)
--   konfidenz_score  numeric  -- capped confidence 0..1
--   bereits_bezahlt  boolean  -- paid by direct debit / credit card (checked less strictly)
--
-- v_belege_list is defined as `select b.*, ...`, but Postgres freezes the b.* column list
-- at view-creation time, so the new columns do NOT appear in the view. Because b.* sits
-- BEFORE the computed steller_sort/pruef_score columns, a plain CREATE OR REPLACE VIEW
-- cannot add them (it forbids reordering existing columns) -> the view must be dropped and
-- recreated. The definition below is identical to migration 0010 apart from that; b.* now
-- expands to include the three new columns. No table/data changes; security_invoker kept.
--
-- The KPI/facet functions (belege_kpis, belege_facets) use string-body SQL, so they hold no
-- hard dependency on the view and the drop is safe.

begin;

drop view if exists public.v_belege_list;

drop view if exists public.v_belege_list;
create view public.v_belege_list with (security_invoker = on) as
select
  b.*,
  coalesce(l.name, b.issuer) as steller_sort,
  (
      case when (b.validation ->> 'brutto_vorhanden') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'steller_vorhanden') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'summe_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'ust_satz_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'iban_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'datum_plausibel') = 'false' then 10 else 0 end
    + case when coalesce(b.validation ->> 'is_small_amount', '') <> 'true'
                and (b.validation ->> 'rechnungsnr_vorhanden') = 'false' then 10 else 0 end
    + case when coalesce(b.validation ->> 'is_small_amount', '') <> 'true'
                and (b.validation ->> 'datum_vorhanden') = 'false' then 10 else 0 end
    + case when b.status = 'zu_pruefen' then 5 else 0 end
    + case
        when (
          select min(v::numeric)
          from jsonb_each_text(coalesce(b.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
          where v ~ '^[0-9.]+$'
        ) < 0.8 then 3
        when (
          select min(v::numeric)
          from jsonb_each_text(coalesce(b.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
          where v ~ '^[0-9.]+$'
        ) < 0.95 then 1
        else 0
      end
  )::int as pruef_score
from public.invoices b
left join public.suppliers l on l.id = b.supplier_id
where b.deleted_at is null;

grant select on public.v_belege_list to authenticated;

commit;
