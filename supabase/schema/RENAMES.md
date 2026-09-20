# What changed from the old schema, and why

Every name the app used that this schema does not have. Read this before editing `tables.ts` or any
query, and before migrating a client who is on the old schema.

## Renamed

| Was | Is now | Why |
|---|---|---|
| `invoice_transaction_matches` | `document_transaction_matches` | the thing being matched is a document, and outgoing invoices have their own table |
| `ai_search_usage` | `assistant_usage` | it records what the assistant cost, not only searching |
| `bwa_account_mapping` | `category_account_mapping` | BWA is one country's report format; the table maps categories to accounts |
| `datev_routes` | `handover_routes` | DATEV is one country's accounting software; the table is about handing over |
| `datev_handover_batches` | `handover_batches` | same |
| `opos_whitelist_rules` | `open_item_whitelist_rules` | OPOS is a German abbreviation for open items |
| `v_invoices_list` | `v_documents_list` | matches the table it reads |
| `v_invoices_review` | `v_documents_review` | same |
| `v_invoices_search` | `v_documents_search` | same |
| `v_company_invoice_totals` | `v_company_document_totals` | same, and its columns are now `document_count` and `document_total` rather than `beleg_anzahl` and `beleg_summe` |
| `v_property_invoice_totals` | `v_property_document_totals` | same |
| `v_supplier_invoice_totals` | `v_supplier_document_totals` | same |

## Columns renamed

| Was | Is now |
|---|---|
| `companies.drive_folder_id`, `properties.drive_folder_id` | `filing_folder`, because where a copy is filed should not name a provider |
| `companies.overhead_cost_center` | `overhead_cost_centre` |
| `property_companies.cost_center_number` | `cost_centre_number` |
| `categories.is_nicht_guv` | `excluded_from_profit_and_loss` |
| `categories.bwa_block`, `categories.bwa_line` | `report_block`, `report_line` |
| `filename_settings.transliterate_umlauts` | `transliterate_accents` |
| `bank_*.banksapi_*` | `provider_ref`, `provider_access_ref`, `provider_account_ref`, `provider_payment_ref`, `provider_user`, `provider_hash` |
| `outgoing_invoices.voucher_number`, `voucher_status`, `voucher_date` | `invoice_number`, `status`, `invoice_date` |
| `outgoing_invoices.dunning_level`, `dunning_due_date` | `reminder_level`, `reminder_due_date` |
| `documents.datev_handed_over_at`, `datev_batch_id` | `handed_over_at`, `handover_batch_id` |
| `approvers.role` | `step`, with values `first` and `final` rather than `assistant` and `manager` |
| `approvers.payment_handler` | `pays` |

## Values renamed

Stored values are English now. The screen still reads German, from the locale file.

| Column | Was | Is now |
|---|---|---|
| `documents.workflow_status` | eingegangen, in_pruefung, rueckfrage, freigegeben_assistenz, freigegeben_vorgesetzter, bezahlt, uebergeben_datev, abgeschlossen, abgelehnt, nicht_relevant | received, in_review, query, approved_first, approved_final, paid, handed_over, closed, rejected, not_relevant |
| `documents.traffic_light` | gruen, gelb, rot | green, yellow, red |
| `documents.income_tax_treatment` | herstellungsaufwand, erhaltungsaufwand | capital_expense, maintenance_expense |
| `documents.status` (filter) | aufgeteilt | split |
| `bank_transactions.matching_status` | offen, zugeordnet, ignoriert | open, matched, ignored |
| match `status` | kandidat, auto, bestaetigt, abgelehnt | candidate, auto, confirmed, rejected |
| `assignment_rules.vat_treatment` | steuerpflichtig, steuerfrei, kleinunternehmer | taxable, exempt, small_business |
| `categories.direction` | eingang, ausgang | incoming, outgoing |

## Dropped on purpose

| Was | Instead |
|---|---|
| `mail_settings` | a `channels` row with its `channel_folders`. The single-row table only ever held one source |
| `pleo_accounts`, `pleo_tags` | a vendor's own mapping is that integration's business. `bank_transactions` keeps the generic `source`, `external_id`, `spender_name` and `spender_email` |
| `v_trash_base` | folded into `v_trash`, which now returns the naming parts as JSON instead of a German sentence |
| `package_migrations`, `schema_migrations` | tooling tables, created by whatever applies migrations |

## Not here, and not ours

`pipeline_run_requests` and `pipeline_settings` are provisioned by the admin panel, not by this
schema. The Hub reads them when they exist.

## Behaviour that moved out of SQL

- **The review score** was nine German JSON keys and their weights hardcoded in a view. It is now
  `review_score_rules` and `review_confidence_bands`, so a client reorders their own review list by
  changing a row.
- **The trash labels** were built in SQL, in German, including the date format. `v_trash` now
  returns the parts and the app composes the words.
- **The search language** was compiled into a generated column. It is one variable at the top of
  `0009_search.sql`.

## Two shapes for line items and taxes, and only one is used

`documents.line_items` and `documents.tax` are jsonb, and `document_line_items` and
`document_taxes` are tables holding the same facts.

Checked 19.09.2026: **the jsonb columns are the live ones.** The VAT badge reads `documents.tax`,
because a German invoice routinely carries two rates and `vat_rate` alone once reported 19% on a
bill whose real VAT was 7.1% blended. The pipeline persists both `tax` and `line_items` as columns.

**Nothing in the app reads the two tables.** They are created and never queried.

So this is not a duplication to clean up here. Either the tables get wired up and the jsonb becomes
a cache, or the tables go, and that decision belongs with whoever owns the pipeline's persistence.
Do not delete either side without settling it there first.
