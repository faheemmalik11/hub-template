-- ONE SPELLING PER DOCUMENT TYPE, in the column and not only in the UI.
--
-- `document_type` held two spellings of the same thing. The pipeline writes lowercase German
-- ("rechnung", "gutschrift", "mahnung"), while the Hub's upload path, the pipeline's own fallback
-- and the column default (unchanged since 0002) all wrote "Eingangsrechnung".
--
-- src/lib/data/format.ts folds those together, but only for DISPLAY (`belegartKey`). The readers
-- match the raw value:
--   * invoices_facets returns DISTINCT document_type, so the list's document-type dropdown offered
--     two options both labelled "Rechnung", with nothing on screen to tell them apart;
--   * the list filter does document_type = <chosen value>;
--   * invoices_kpis does the same for p_belegart.
-- So picking either of the two identical options silently dropped every invoice stored under the
-- other spelling, and the tiles agreed with the list about the wrong half.
--
-- Folding the values in the column fixes all three readers at once and leaves no alias logic in any
-- of them. No information is lost: these are exactly the pairs the UI has always treated as one
-- type. `belegartKey` stays as the safety net for anything unexpected arriving later.
--
-- Split containers (status = 'aufgeteilt', document_type = 'Sammelscan') are left alone. They are
-- excluded from v_invoices_list and so from every list, facet and KPI, and the pipeline writes and
-- asserts that exact literal (pipeline_new/adapters/repo/receipts.py).
--
-- The writers changed in the same pass, so the second spelling cannot come back:
--   * src/lib/data/queries.ts, useCreateUploadBelege, now inserts 'rechnung'
--   * pipeline_new/adapters/repo/receipts.py, the dokumenttyp fallback, now writes 'rechnung'
--   * the column default, below
--
-- Re-running this is a no-op: every value it writes is already its own canonical form.
do $$
declare
  v_rows int;
begin
  update public.invoices i
     set document_type = coalesce(a.kanon, n.norm)
    from (
           select id,
                  -- The same normalization belegartKey does: trim, lowercase, whitespace runs to
                  -- underscores. Kept in step with BELEGART_ALIASES in src/lib/data/format.ts.
                  regexp_replace(lower(btrim(document_type)), '\s+', '_', 'g') as norm
             from public.invoices
            where document_type is not null
              and btrim(document_type) <> ''
              and coalesce(status, '') <> 'aufgeteilt'
         ) n
         left join (values
           ('eingangsrechnung', 'rechnung'),
           ('rechnungen',       'rechnung'),
           ('invoice',          'rechnung'),
           ('invoices',         'rechnung'),
           ('erechnung',        'rechnung'),
           ('e-rechnung',       'rechnung'),
           ('gutschriften',     'gutschrift'),
           ('credit_note',      'gutschrift'),
           ('mahnungen',        'mahnung'),
           ('dunning',          'mahnung'),
           ('angebote',         'angebot'),
           ('offer',            'angebot'),
           ('lieferscheine',    'lieferschein'),
           ('delivery_note',    'lieferschein'),
           ('kontoauszuege',    'kontoauszug'),
           ('bank_statement',   'kontoauszug'),
           ('advertising',      'werbung'),
           ('not_a_receipt',    'kein_beleg')
         ) as a(quelle, kanon) on a.quelle = n.norm
   where i.id = n.id
     and i.document_type is distinct from coalesce(a.kanon, n.norm);

  get diagnostics v_rows = row_count;
  raise notice 'invoices.document_type: % row(s) folded onto their canonical spelling', v_rows;
end $$;

-- An insert that names no document type is an incoming invoice, and now says so in the same words
-- as every other row.
alter table public.invoices alter column document_type set default 'rechnung';
