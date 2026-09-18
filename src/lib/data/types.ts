// Domänen-Typen für die echten Supabase-Tabellen (Stufe 1 — Lesen).
// Quelle: pipeline/db_schema.sql + Form von `extracted` aus
// pipeline/prompts/eingangsrechnung.txt. Bewusst schlank, nur für die Anzeige.

import type { AppRole } from "@/lib/auth";
import type { DatevBlockReason } from "@/lib/datev/attachment-rules";

// Extraction status. The DB column has NO CHECK constraint (only DEFAULT 'erkannt'),
// but in practice only 'erkannt' | 'zu_pruefen' are written. The UI filters on these two.
export type BelegStatus = "erkannt" | "zu_pruefen";

// Workflow status (approval chain) — separate `workflow_status` column, independent of the
// extraction `status`. Values per the DB CHECK (migrations 0002/0025/0035/0036). `paid_at` (+
// confirmed bank match) is still the source of truth for "is this actually paid" — 'bezahlt' is
// DERIVED from it by a DB trigger (migration 0036), not written directly by the front-end.
export type WorkflowStatus =
  | "eingegangen"
  | "in_pruefung"
  | "rueckfrage"
  | "freigegeben_assistenz"
  | "freigegeben_vorgesetzter"
  // Payment lifecycle (migration 0036). 'freigegeben_vorgesetzter' IS the "awaiting payment"
  // state — no separate "released for payment" stage. 'bezahlt' is set by a DB trigger the
  // moment paid_at is confirmed (bank match, auto-suggested or manually created — same
  // mechanism — or the manual "paid" checkbox), never written directly by the front-end.
  | "bezahlt"
  | "uebergeben_datev"
  | "abgeschlossen"
  // Two side paths off the main chain (Appendix A6), added by migration 0025. `abgelehnt` is
  // final and archived; `nicht_relevant` means "this is not a receipt" and hands the mail back.
  | "abgelehnt"
  | "nicht_relevant";

// Verlauf-/Notiz-Eintrag (Tabelle beleg_verlauf) — kombiniert Notiz + Audit.
// "zuordnung" = company/property (Gesellschaft/Objekt) assignment change; also used for bank matches.
// "regel" = a rule applied a value (written by apply_assignment_rules, migration 0025).
// "nicht_relevant" / "archiviert" = review decisions that take the receipt out of processing.
export type VerlaufTyp =
  | "notiz"
  | "statuswechsel"
  | "aenderung"
  | "zuweisung"
  | "zuordnung"
  | "loeschung"
  | "regel"
  | "nicht_relevant"
  | "archiviert"
  // Approval workflow (Briefing Screen 6, migration 0035). One of these per approve/return/
  // reject/skip action.
  | "freigabe_pruefung"
  | "rueckfrage"
  | "freigabe_final"
  | "ablehnung"
  | "bereits_freigegeben"
  | "uebersprungen"
  // Manual override outside the gated actions — fixes an accidental click by setting
  // workflow_status directly to any status, bypassing the normal chain.
  | "korrektur"
  // Payment lifecycle (migration 0036). 'bezahlt' is written by the DB trigger itself, stating
  // how the invoice was paid (reads invoices.paid_source); 'zahlung_fehlgeschlagen' is the
  // human "payment failed, back to open" action.
  | "bezahlt"
  | "zahlung_fehlgeschlagen"
  // DATEV handover (Briefing Screen 9, migration 0038). Written by the DB trigger itself the
  // moment datev_handed_over_at is set, the same shape as 'bezahlt' above.
  | "uebergeben_datev";

export interface BelegVerlauf {
  id: number;
  document_id: string;
  type: VerlaufTyp | string;
  text: string | null;
  data: Record<string, unknown> | null;
  actor: string | null;
  created_at: string;
}

// Konfidenz je Feld aus der KI-Extraktion (0..1). Nicht jedes Feld ist immer da.
export interface Konfidenz {
  rechnungssteller?: number;
  rechnungsnummer?: number;
  beleg_datum?: number;
  betrag_netto?: number;
  ust_betrag?: number;
  betrag_brutto?: number;
  gesellschaft_code?: number;
  objekt_code?: number;
  [feld: string]: number | undefined;
}

export interface BelegPosition {
  beschreibung?: string | null;
  menge?: number | null;
  einzelpreis?: number | null;
  betrag?: number | null;
  ust_satz?: number | null;
  // Reserved for the parked "split booking" feature (one category/property per line item, e.g. a
  // hardware-store receipt covering two properties). Decided: the split UI comes later, but the
  // data model must be line-item capable from the start since line items are already extracted
  // individually — so this can be switched on later without a rebuild. Not populated or editable
  // anywhere yet; mirrors Beleg.category_id/property_id so a future split UI can reuse the same
  // Combobox components already built for invoice-level assignment.
  id?: string | null;
  category_id?: string | null;
  property_id?: string | null;
}

export interface BelegSteuer {
  satz?: number | null;
  netto?: number | null;
  ust?: number | null;
}

// Vollständiges KI-Extraktions-JSON (lose typisiert — wir lesen nur Einzelfelder).
export interface Extracted {
  konfidenz?: Konfidenz;
  // The pipeline's per-check validation map, and the older flat gate object it replaces. Both are
  // read through validierungDetail() / validierungFlach() in format.ts, never directly: a receipt
  // ingested before either existed still has to render, and the fallback order lives in one place.
  validation_detail?: Record<string, unknown> | null;
  validation?: Validierung | null;
  zusammenfassung?: string | null;
  volltext?: string | null;
  rechnungssteller_ustid?: string | null;
  steuer_aufschluesselung?: BelegSteuer[] | null;
  [feld: string]: unknown;
}

export interface Validierung {
  summe_ok?: boolean;
  datum_vorhanden?: boolean;
  brutto_vorhanden?: boolean;
  steller_vorhanden?: boolean;
  rechnungsnr_vorhanden?: boolean;
  ust_satz_ok?: boolean | null;
  iban_ok?: boolean | null;
  datum_plausibel?: boolean | null;
  kleinbetrag?: boolean;
  decision_reason?: string;
  [feld: string]: unknown;
}

export interface Gesellschaft {
  id: string;
  code: string;
  name: string;
  // Which date buckets an invoice into a period for the Cost Analysis (Briefing Screen 10;
  // migration 0041). 'invoice_date' = accrual accounting (IMKO, IMGM today), 'payment_date' =
  // surplus accounting (everyone else, pending their tax status being confirmed). Nullable
  // because useGesellschaften() reads through the typed `companies` table, whose generated stub
  // predates this column — always present on the live row, just not guaranteed by the stub type.
  booking_basis: "invoice_date" | "payment_date" | null;
  /** The company's "Gemeinkosten" cost centre from the tax adviser's workbook (migration 0077). */
  overhead_cost_center: number | null;
  // Area of responsibility for approval routing (migration 0087) -- NULL if not yet assigned.
  // See ApprovalArea and docs/APPROVAL_ROUTING.md.
  area: ApprovalArea | null;
  // Dropbox folder this company's documents are filed into (migration 20260831170000). NULL means
  // not configured; the pipeline files nothing on a guess.
  drive_folder_id: string | null;
  // Soft delete (archive). The columns have existed on `companies` for a long time; nothing read or
  // wrote them until the archive action was added. Never a hard delete: companies.code is referenced
  // by string from invoices.company_code and entity_aliases.entity_code.
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Objekt (Immobilie/Projekt) — Stammdaten-Tabelle `objekte`. belege.objekt_id referenziert diese
// Tabelle. Es gibt KEINE company-Spalte mehr (migration 0007): die Gesellschaft(en) eines Objekts
// ergeben sich aus `property_companies` (direct property↔company assignment, migration 0083).
export interface Objekt {
  id: string;
  code: string;
  name: string | null;
  address: string | null;
  vat_status: string | null;
  created_at: string;
  updated_at: string;
  // Archive, not a hard delete: a sold property stays intact for its historical invoices, just out
  // of the everyday list. The columns were already on the table and `properties` was already in
  // trash_eligible_tables() (migration 0062), so the Papierkorb could restore a property nothing
  // in the Hub could archive. This is the missing half of that.
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// Direct property ↔ company assignment — table `property_companies` (migration 0083). Replaces
// the business-line model (property × business_line → company): a property may genuinely belong
// to more than one company (the client's dual-ownership cases), so this is a plain many-to-many.
// The UI requires at least one company before a property's form can be saved.
export interface PropertyCompany {
  id: string;
  property_id: string;
  company_id: string;
  /**
   * The cost-centre number from the tax adviser's workbook (migration 20260911250000).
   *
   * On the PAIRING, because the same building is numbered differently in each company's books:
   * Ludwigshafen is 6 for Stäy and 101 for Impuls. Null where the workbook has no number for that
   * pairing, which includes every link a person made by hand.
   */
  cost_center_number: number | null;
  created_at: string;
  updated_at: string;
  /** Soft delete: a past link explains how earlier receipts were booked (migration 0083). */
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// Import exclusion rules (table `ingest_exclusions`; migrations 0008/0015/0016). A rule EXCLUDES
// matching mail/invoices from import. `scope` decides where `term` is matched (pre-read envelope or
// post-read extracted fields). Post-dates the generated Database type → read/written via `sb`.
// Soft-deletable (deleted_at/deleted_by/delete_reason).
export type ExclusionScope =
  | "sender"
  | "subject"
  | "filename"
  | "envelope"
  | "party"
  | "supplier"
  | "body"
  | "company"
  | "property";

export interface Exclusion {
  id: string;
  scope: ExclusionScope;
  term: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Filename settings (filename_settings; migration 20260804090000_filename_settings) ----
// Singleton row (id is always `true`) that drives the admin-configurable uniform filename
// pattern "YYYYMMDD COM[_VAT] Issuer Description [Amount] [Property]" — see
// docs/FILENAME_CONVENTION.md and src/lib/filename.ts (the builder that consumes this).
export type FilenameDescriptionSource = "service_description" | "cost_category" | "none";

export interface FilenameSettings {
  id: true;
  separator: string;
  vat_suffix: string;
  include_vat_suffix: boolean;
  include_amount: boolean;
  include_property: boolean;
  description_source: FilenameDescriptionSource;
  transliterate_umlauts: boolean;
  updated_at: string;
  updated_by: string | null;
}

// ---- OPOS whitelist (opos_whitelist_rules; pipeline migration 0018) ----
// Transactions that can never have a receipt — salaries, tax prepayments, private withdrawals,
// rebookings, loan installments (Briefing Screen 10). A matching rule parks the transaction in
// matching_status='ignoriert' so it drops out of the open-items list and out of matching.

// Which transaction field a rule's term is matched against.
export type OposWhitelistScope = "reference" | "counterparty" | "iban" | "booking_text" | "any";

// WHY a receipt will never exist. The first five are the briefing's named categories.
export type OposCategory =
  | "salary"
  | "tax_prepayment"
  | "private_withdrawal"
  | "rebooking"
  | "loan_installment"
  | "fee_interest"
  | "atm_withdrawal"
  | "other";

export interface OposWhitelistRule {
  id: string;
  scope: OposWhitelistScope;
  category: OposCategory;
  term: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Both are written by the create path and were simply never read: the rules screen showed no
  // author and no age at all, on a global rule set anyone could add to
  // (docs/audit/opos-whitelist/opos-whitelist/ISSUES.md #12). created_at also decides which of two
  // overlapping rules a transaction is credited to, so it is not decoration.
  created_by: string | null;
}

export interface Lieferant {
  id: string;
  name: string;
  vat_id: string | null;
  iban: string | null;
  address: string | null;
  // Stufe-2-Felder (Migration 001):
  bic: string | null;
  bank_name: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  // Filled by the pipeline as it touches each row (migration 20260824100000), so it is null on
  // rows the pipeline has not seen since. Which token in vat_id is actually a VAT id depends on a
  // per-country format the pipeline owns, so the Hub reads this and never writes it.
  normalized_vat_ids: string[] | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string | null;
}

// One row per bank account a supplier is known to bill from (migration 20260824100000).
//
// `suppliers.iban` stays the DEFAULT account -- the pipeline's fraud screen and the payment path
// both read it -- and this table holds every account, so alternating between two legitimate ones
// stops reading as the "IBAN changed" fraud flag that supplier_iban_history derives.
//
// Two invariants no constraint enforces, so the code has to:
//   * whatever suppliers.iban holds exists as an active row for that supplier;
//   * a soft-deleted supplier keeps its accounts, so a past payment stays explainable.
//
// `iban` is always compacted (no spaces, upper case) -- a database trigger rewrites it on write,
// so never compare a raw form against it. Use compactIBAN() from format.ts on the other side.
export interface SupplierBankAccount {
  id: string;
  supplier_id: string;
  iban: string;
  bic: string | null;
  bank_name: string | null;
  source: "pipeline" | "human" | "backfill";
  // Kept rather than deleted, so an account that was paid can still be explained. There is
  // deliberately no delete policy on the table; "remove" means setting this false.
  is_active: boolean;
  // The account the supplier is paid on. At most one per supplier, enforced by a partial unique
  // index (migration 20260827170000). Mirrors suppliers.iban, which stays authoritative: triggers
  // keep the two pointing at the same account whichever side is written.
  is_default: boolean;
  // Set when the owning supplier is soft-deleted, cleared when it is restored (migration
  // 20260827180000). Separate from is_active: that says the supplier stopped billing from this
  // account, this says the supplier itself is in the Papierkorb.
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  // Null while an account the PIPELINE read off an invoice waits for a person to vouch for it
  // (migration 20260828170000). An account added in the Hub, and every account of a supplier the
  // pipeline created from scratch, is confirmed on the spot -- a human already saw it.
  confirmed_at: string | null;
  confirmed_by: string | null;
  // False for a masked IBAN ("DE****...4556") the reader could only partly make out. Generated in
  // the database (migration 20260828180000), so it cannot drift from the value it describes. The
  // default account is constrained to be payable.
  is_payable: boolean | null;
  first_seen_at: string;
  last_seen_at: string;
  created_by: string | null;
}

/**
 * Which accounts a single invoice actually printed, in the order they appeared on the page
 * (migration 20260828170000). Written by the pipeline on every extraction, so re-reading a
 * document replaces its links rather than adding to them.
 */
export interface InvoiceBankAccount {
  document_id: string;
  supplier_bank_account_id: string;
  position: number;
  /**
   * Why this account is on this invoice (migration 20260828200000). `invoice` means the
   * document printed it; `supplier_default` means it printed none and the supplier's
   * standing account is standing in. Optional, for rows written before the column existed.
   */
  origin?: "invoice" | "supplier_default";
  first_seen_at: string;
  // Optional PostgREST-embedded relation (select "*, supplier_bank_accounts(*)").
  supplier_bank_accounts?: SupplierBankAccount | null;
}

// Trigger-populated only (migration 0040) — never a direct write. One row per past IBAN/BIC/bank
// name a supplier had, captured whenever suppliers.iban changes.
export interface SupplierIbanHistory {
  id: string;
  supplier_id: string;
  /**
   * What happened (migration 20260828110000). `account_added` and `default_set` describe the
   * account in this row. `default_changed` is the legacy event, where the row holds the account
   * that was REPLACED rather than the one that was set.
   *
   * Optional because rows written before that migration have no value, and because the column
   * itself is absent until it is applied. Readers treat a missing value as `default_changed`,
   * which is exactly what those rows are.
   */
  event?: "account_added" | "default_set" | "default_changed" | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  changed_at: string;
  changed_by: string | null;
}

// entity_aliases row scoped to entity_type='lieferant' (migration 0040 wires suppliers into the
// generic alias table already used for gesellschaft/objekt — see entity_aliases, migration 0003).
export interface SupplierAlias {
  id: string;
  entity_type: string;
  entity_code: string; // supplier id
  alias: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

// Row of v_supplier_duplicates (migration 0040) — a group of suppliers sharing a name/VAT-ID/IBAN.
export interface SupplierDuplicateGroup {
  // "iban" was dropped when the view stopped matching on it (see migration
  // 20260817240000): a shared IBAN turned out to mean a shared payment provider, not a
  // duplicate. "steuernummer" was added, since a German tax number is what many of these
  // records actually carry in the vat_id field.
  key_type: "name" | "vat_id" | "steuernummer";
  key_value: string;
  n: number;
  ids: string[];
}

export interface Beleg {
  id: string;
  company_id: string | null;
  company_code: string | null;
  supplier_id: string | null;
  issuer: string | null;
  issuer_address: string | null;
  document_type: string | null;
  document_date: string | null;
  service_date: string | null;
  service_period_from: string | null;
  service_period_to: string | null;
  invoice_number: string | null;
  amount_net: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  amount_gross: number | null;
  currency: string | null;
  is_small_amount: boolean | null;
  intake_channel: string | null;
  source: string | null;
  property_code: string | null;
  property_id: string | null;
  /**
   * "Gemeinkosten": this invoice belongs to the company, not to a property (migration
   * 20260911250000). Mutually exclusive with property_id, and distinct from both being empty,
   * which means nobody has decided yet. Resolves to the company's overhead_cost_center.
   */
  is_overhead: boolean;
  cost_category: string | null;
  // Structured taxonomy reference (bwa_categories), additive to cost_category (migration 0030).
  // Null means "not yet categorized". Shares cost_category_source: they describe the same
  // categorization decision, one structured and one free text, kept in sync by apply_assignment_rules.
  category_id: string | null;
  service_description: string | null;
  line_items: BelegPosition[] | null;
  tax: BelegSteuer[] | null;
  ocr_fulltext: string | null;
  status: string | null;
  // Erkennungs-Ampel aus der Pipeline (Briefing A2/A6): server-berechnetes, gedeckeltes
  // Vertrauens-Ampellicht. Getrennt von workflow_status und von der client-seitigen
  // Feld-Konfidenz (konfidenzAmpel). 'gruen' | 'gelb' | 'rot'; null = noch nicht bewertet.
  traffic_light: string | null;
  confidence_score: number | null;
  already_paid: boolean | null;
  extracted: Extracted | null;
  validation: Validierung | null;
  // The pipeline's per-check map, one column of its own since migration 0007 (before that it lived
  // only inside `extracted`). Read through validierungDetail() in format.ts, never directly: both
  // homes have to stay readable. Keys are the check names, values ValidierungDetailEintrag.
  validation_detail?: Record<string, unknown> | null;
  storage_path: string | null;
  source_item_id: string | null;
  created_at: string;
  // Multi-receipt scan split (pipeline migration 0009). On a CHILD invoice, source_document_id points
  // at the container row that holds the full original scan and page_range says which pages were carved
  // out for it ('1-1', '2-3'). Both null on a normal single-document invoice. The container row itself
  // is hidden from the lists (0020) but stays reachable through these two fields.
  source_document_id: string | null;
  page_range: string | null;
  // Stufe-2-Felder (Migration 001):
  workflow_status: string | null;
  /** HISTORICAL (migration 20260901160400). Superseded by assigned_user_id; matched by name, so
   *  renaming somebody silently revoked every assignment they held. Still read for DISPLAY of old
   *  rows that never resolved to an account. */
  assigned_to: string | null;
  /** Who was handed this receipt explicitly. An assignment ADDS an actor: the assignee may act
   *  even when the resolved rule names other people. */
  assigned_user_id: string | null;
  // app_users.id of whoever moved this to freigegeben_vorgesetzter, cleared when it leaves that
  // state. The key the two-person rule compares the payer against (migration 20260828160000).
  approved_by: string | null;
  order_number: string | null;
  due_date: string | null;
  early_payment_deadline: string | null;
  early_payment_discount_percent: number | null;
  early_payment_discount_amount: number | null;
  paid_at: string | null;
  // Where paid_at came from (migration 0024). 'bank_match' = derived from confirmed bank matches
  // and withdrawn again if coverage drops; 'manual' or null = a human set it, never auto-cleared.
  paid_source: "bank_match" | "manual" | null;
  // "Handed over to DATEV" — its own checkbox (Briefing Appendix A6), not just a status.
  // workflow_status='uebergeben_datev' is DERIVED from this by a DB trigger (migration 0038),
  // never written directly by the front-end, mirroring how paid_at drives 'bezahlt'.
  datev_handed_over_at: string | null;
  datev_batch_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  // Additional extraction fields in the DB (core principle: "no data loss"):
  recipient_name: string | null;
  recipient_address: string | null;
  customer_number: string | null;
  payment_reference: string | null;
  payment_method: string | null;
  tax_note: string | null;
  // ---- Review & assign (Briefing Screen 3; migration 0025) ----
  // The applied VAT qualifier a rate alone cannot express (reverse charge, small-business owner —
  // see AssignmentRule.vat_treatment, which this is resolved FROM).
  vat_treatment: VatTreatment | null;
  // Provenance per resolved field. A 'human' value is never overwritten by a rule. null means
  // "not recorded" and counts as overwritable, because the ingestion pipeline writes extracted
  // values without a source and treating those as locked would stop rules working on old data.
  // DEPRECATED: one shared column covering both company and property, which made settling one of
  // them mark the other "manual" in the UI, and left a company chosen by hand reading "AI". Split
  // into the two fields below; do not read or write this one in new code.
  assignment_decided_by: FieldSource | null;
  // Provenance per assignment field, replacing assignment_decided_by above.
  company_assignment_source: FieldSource | null;
  property_assignment_source: FieldSource | null;
  vat_source: FieldSource | null;
  cost_category_source: FieldSource | null;
  // HOW the pipeline resolved the company, which is a different question from who decided it
  // (migration 0027 split the two apart). Owned by the pipeline; the Hub reads it and never writes
  // it, so a reviewer's edit cannot destroy the record of how the match was originally made.
  assignment_source: AssignmentMethod | null;
  // "Not relevant": drops out of processing and is handed back to the mailbox. The physical mail
  // move happens in the external Python pipeline, which stamps `mailbox_reset_at` when done — so
  // not_relevant_at set with mailbox_reset_at still null means the return is pending.
  not_relevant_at: string | null;
  not_relevant_by: string | null;
  not_relevant_note: string | null;
  mailbox_reset_at: string | null;
  // Archive of a wrongly ingested receipt. Kept out of everyday lists, never hard-deleted.
  archived_at: string | null;
  archived_by: string | null;
  archive_note: string | null;
  // ---- VAT deductibility & tax reserve (Briefing Screen 5; migration 0031, re-keyed 0083) ----
  // Resolved % of vat_amount actually reclaimable as input VAT. Defaults from the property's own
  // vat_status (steuerpflichtig=100, steuerfrei=0, gemischt=null/ambiguous), overridden by a
  // vat_rate rule's own vat_deductible_pct, overridden by a human. Null means not yet resolved.
  vat_deductible_pct: number | null;
  // Same ai|rule|human triad as vat_source. 'ai' covers both a raw AI guess and the system default
  // computed from the property's vat_status — which one fired is in the invoice_history log text.
  vat_deductibility_source: FieldSource | null;
  vat_special_case: VatSpecialCase | null;
  // Generated columns (vat_amount x vat_deductible_pct / 100, and the remainder). Null whenever
  // either vat_amount or vat_deductible_pct is unresolved — never defaulted to 0 or 100.
  vat_deductible_amount: number | null;
  vat_nondeductible_amount: number | null;
  // Set when a VAT rule flips a receipt's liability status (no VAT -> real VAT, or the reverse)
  // versus what was previously resolved — the briefing's "must stand out" warning-on-change.
  vat_conflict_at: string | null;
  vat_conflict_note: string | null;
  // ---- Income tax treatment (migration 0055) ----
  // Herstellungsaufwand vs. Erhaltungsaufwand — separate from vat_special_case above: this is an
  // income-tax capitalization question (must the cost be capitalized/depreciated, or is it
  // immediately deductible), not a VAT deductibility one. Null means not applicable/not decided;
  // most receipts never need this distinction. Human-set only, no rule-engine target.
  income_tax_treatment: IncomeTaxTreatment | null;
}

// ---- Open items (view v_open_items, migration 20260819210000) ----

/**
 * Why a receipt cannot become an open item even though nothing has settled it.
 *
 * Coverage is measured against the gross amount, so three kinds of row used to sit on Offene Posten
 * for ever with no action on the screen able to close them. They are named rather than dropped: the
 * screen reports the count and can list them, so somebody can go and fix the amount.
 *
 *   kein_betrag     no gross amount was ever extracted, so there is nothing to measure against
 *   gutschrift      a negative gross, a supplier credit note: money coming back rather than owed
 *   privat_bezahlt  already_paid: settled from a private account, so no company bank movement
 *                   can ever match it
 */
export type OpenItemBlocker = "kein_betrag" | "gutschrift" | "privat_bezahlt";

/**
 * One row of `v_open_items`, narrowed to what Offene Posten actually renders.
 *
 * DELIBERATELY NOT `Beleg`. This screen used to read useBelege(), which is `select *` over the
 * whole invoices table: 5.7 MB for 418 rows on the Stäy Hub, of which 5.2 MB is the embedding
 * vector, the fts tsvector, the extracted JSONB and ocr_fulltext, none of which this screen looks
 * at. The columns below are the complete set it does look at, plus the three the view adds.
 */
export interface OpenItemRow {
  id: string;
  company_id: string | null;
  company_code: string | null;
  property_code: string | null;
  supplier_id: string | null;
  issuer: string | null;
  invoice_number: string | null;
  amount_gross: number | null;
  document_date: string | null;
  due_date: string | null;
  early_payment_deadline: string | null;
  early_payment_discount_percent: number | null;
  early_payment_discount_amount: number | null;
  created_at: string;
  cost_category: string | null;
  /** Confirmed allocations only, already summed by the view. */
  matched_sum: number;
  is_open: boolean;
  open_blocker: OpenItemBlocker | null;
}

/** The columns of `v_open_items` that OpenItemRow declares, as a PostgREST select list. */
export const OPEN_ITEM_COLUMNS =
  "id, company_id, company_code, property_code, supplier_id, issuer, invoice_number, " +
  "amount_gross, document_date, due_date, created_at, cost_category, matched_sum, " +
  "early_payment_deadline, early_payment_discount_percent, early_payment_discount_amount, " +
  "is_open, open_blocker";

// ---- Review & assign: field provenance and rules (migration 0025) ----

// Where a resolved value came from. The briefing's hard rule is that 'human' outranks the other
// two and is never overwritten automatically.
export type FieldSource = "ai" | "rule" | "human";

// How the ingestion pipeline resolved the company, which is NOT the same question as who decided
// it. Owned by pipeline/resolve_codes.py; kept in step with the CHECK constraint in migration 0083
// (renamed from property_assignment(+name) to match property_companies). 'unresolved' means the
// pipeline could not derive a company and the receipt went to the catch-all.
export type AssignmentMethod = "property_company" | "property_company+name" | "name" | "unresolved";

// Which field a rule decides. One target per rule, so a supplier-level category rule cannot drag
// a VAT rate along with it.
export type RuleTarget = "cost_category" | "vat_rate";

export const RULE_TARGETS: readonly RuleTarget[] = ["cost_category", "vat_rate"];

// VAT qualifier for the cases a bare rate cannot express (Briefing Screen 5). This is also exactly
// the domain assignment_rules.vat_treatment's CHECK constraint accepts. invoices.vat_treatment has
// no such constraint and can additionally hold the pipeline's own 'gemischt'/'unbekannt' (an
// overhead receipt with no resolvable business line, or a business line whose own VAT treatment is
// 'gemischt') — values outside this type despite what it promises. Never forward a receipt's
// vat_treatment into a new rule without checking it against VAT_TREATMENTS first.
export type VatTreatment = "steuerpflichtig" | "steuerfrei" | "reverse_charge" | "kleinunternehmer";

export const VAT_TREATMENTS: readonly VatTreatment[] = [
  "steuerpflichtig",
  "steuerfrei",
  "reverse_charge",
  "kleinunternehmer",
];

// Tax special cases that change the deductible amount (Briefing Screens 4 & 5; migration 0031).
// 'hospitality' suggests, but does not force, a 70% default in the UI — German tax law restricts
// only the INCOME-TAX deductibility of Bewirtung to 70%, input VAT is normally 100% reclaimable;
// confirm with the tax advisor which this should mean here. 'down_payment' is a pure flag (an
// Anzahlung's VAT timing/matching issue for the final invoice) and does not itself change the %.
export type VatSpecialCase = "hospitality" | "partial" | "down_payment";

export const VAT_SPECIAL_CASES: readonly VatSpecialCase[] = [
  "hospitality",
  "partial",
  "down_payment",
];

// Herstellungsaufwand vs. Erhaltungsaufwand (production vs. maintenance expense) — an income-tax
// capitalization question (must the cost be capitalized/depreciated over the building's life, or
// is it immediately deductible as a repair/maintenance expense), separate from VatSpecialCase
// above (which is about VAT deductibility). Briefing: "cannot be squeezed into the category —
// needs its own flag." Migration 0055.
export type IncomeTaxTreatment = "herstellungsaufwand" | "erhaltungsaufwand";

export const INCOME_TAX_TREATMENTS: readonly IncomeTaxTreatment[] = [
  "herstellungsaufwand",
  "erhaltungsaufwand",
];

// A multi-level assignment rule (table `assignment_rules`). Any combination of the three scope
// dimensions may be pinned; an unpinned one means "any". `specificity` is a generated column, so
// it is read-only here: the most specific match wins, primarily by how many dimensions are
// pinned, then by the tie-break order supplier > property > company. business_line_id dropped as
// a dimension by migration 0083.
export interface AssignmentRule {
  id: string;
  target: RuleTarget;
  cost_category: string | null;
  // Structured taxonomy reference (bwa_categories), additive to cost_category (migration 0030).
  // Null on a rule created before 0030, or one inserted directly by the pipeline's own test
  // fixtures — resolution then falls back to comparing cost_category text, exactly as before.
  category_id: string | null;
  vat_rate: number | null;
  vat_treatment: VatTreatment | null;
  // Additive to vat_rate on the same rule row (migration 0031). Only meaningful when
  // target = 'vat_rate'; null on a cost_category rule or one created before 0031.
  vat_deductible_pct: number | null;
  vat_special_case: VatSpecialCase | null;
  supplier_id: string | null;
  property_id: string | null;
  company_id: string | null;
  reference_pattern: string | null;
  specificity: number;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// Retroactive impact of a rule (RPC assignment_rule_preview). `matches` is everything in scope,
// `would_change` only what this rule actually wins and no human has decided — the gap between
// them is how much of the scope is already correct or already settled by a person.
export interface RulePreview {
  matches: number;
  would_change: number;
}

// Result of retroactively applying one rule across its scope (RPC assignment_rule_bulk_apply,
// migration 0029). `matches` mirrors RulePreview.matches for the same rule; `changed`/`skipped`
// are receipt counts, not field counts (one receipt can have both its category and VAT changed
// by the same bulk run and still counts once).
export interface RuleBulkApplyResult {
  rule_id: string;
  matches: number;
  changed: number;
  skipped: number;
  changed_ids: string[];
}

// ---- VAT deductibility & tax reserve (Briefing Screen 5; migration 0031) ----

// Per-company input-VAT summary (RPC vat_reserve). output_vat is a stub (always 0) until the
// outgoing-invoices feature exists; reserve = output_vat - input_vat_deductible, so it reads
// negative today — correct and expected, not a bug. Unresolved deductibility is reported
// separately, never folded into 0% or 100%.
export interface VatReserve {
  company_id: string;
  von: string | null;
  bis: string | null;
  input_vat_total: number;
  input_vat_deductible: number;
  input_vat_nondeductible: number;
  input_vat_unresolved_count: number;
  input_vat_unresolved_amount: number;
  output_vat: number;
  reserve: number;
}

// ---- Category taxonomy & account mapping (Briefing Screen 4 / Appendix A3; migration 0030) ----

// Two-level: `parent_id` null = coarse group (~20, e.g. "Personalkosten"), non-null = fine tag
// (~87, e.g. "Energie" under "Raumkosten"). Both levels are valid category_id targets — the
// briefing allows an even coarser assignment when that is all that is known.
export interface BwaCategory {
  id: string;
  code: string;
  name: string;
  name_en: string;
  parent_id: string | null;
  bwa_block: "einnahmen" | "wareneinsatz" | "kosten" | "neutral" | "steuern" | "sonderfall";
  bwa_line: string;
  // Which tab the category belongs to (migration 0076). Kept separate from bwa_block, whose six
  // values do not split cleanly into the client's two tabs.
  direction: "eingang" | "ausgang";
  // Manual order within one level (siblings under the same parent). Ties fall back to name.
  sort_order: number;
  // "Belongs in no evaluation line": actively excluded from the P&L once the bank is connected.
  is_nicht_guv: boolean;
  // "Nicht zugeordnet": the catch-all a receipt waits in until a human resolves it.
  is_catchall: boolean;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// Free-text spelling -> category_id (table bwa_category_aliases), mirrors entity_aliases.
export interface BwaCategoryAlias {
  id: string;
  category_id: string;
  alias: string;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// (fiscal_year, account) -> category_id (table bwa_account_mapping). Year-keyed because DATEV
// rebuilds the chart of accounts every year. Seeded empty; populated via the Kontenrahmen import.
export interface BwaAccountMapping {
  id: string;
  fiscal_year: number;
  account: string;
  company_id: string;
  category_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// Approval workflow (Briefing Screen 6, migration 0035). Name-based, not tied to Supabase auth
// identity — the same spirit as the older hardcoded ZUWEISBAR list, promoted to a real table
// because a deputy pointer and per-company chain config cannot live in a flat array.
// Area of responsibility (migration 0087; client: "each department head approves their own
// area"). This is the canonical, routing-facing value. See docs/APPROVAL_ROUTING.md.
export type ApprovalArea = "hospitality" | "stay_re";

/**
 * One person in the approval-chain directory, from the `chain_people()` RPC.
 *
 * Why an RPC and not a plain select on app_users: `approvers` was readable by everyone
 * (`using (true)`), which is what the invoice list's responsible-person column, the overdue and
 * deputy warnings and the assignment picker are built on. `app_users` is admin-only, so reading
 * the chain from it directly would blank all of those for an ordinary user -- silently, since an
 * empty result from a scoped select is not an error. chain_people() exposes exactly the columns
 * approvers already exposed, and nothing else. See migration 20260901160200.
 */
export interface ChainPerson {
  id: string;
  name: string | null;
  /** The person's role in Team & Rollen (migration 20260901160600). Shown beside the name in every
   *  picker, because a name alone does not say whether picking somebody produces a working chain.
   *  NULL only for an account with no role row at all. */
  role_name: AppRole | null;
  is_active: boolean;
  escalation_days: number | null;
  deputy_user_id: string | null;
  area: ApprovalArea | null;
  covers_all_areas: boolean;
}

/**
 * HISTORICAL (migration 20260901160000). The approval chain used to live in its own table, keyed
 * by `name`, and you registered a person here a second time after creating them in Team & Rollen.
 * The chain now names app_users by id: app_users.deputy_user_id/escalation_days/area/
 * covers_all_areas hold the person properties, approval_rules.step_1_user_id/step_2_user_id hold
 * the steps, and `chain_people()` is the directory. Nothing in src/ reads this table any more.
 *
 * The type is kept only so the migration's own intent stays legible from the code; delete it once
 * nothing references it. See ChainPerson for the live shape.
 */
export interface Approver {
  id: string;
  name: string;
  role: "assistant" | "manager";
  deputy_name: string | null;
  escalation_days: number | null;
  payment_handler: "boss" | "account_holder" | null;
  // The one area this approver signs off for (role='manager' only). Mutually exclusive with
  // covers_all_areas.
  area: ApprovalArea | null;
  // "All areas" (client: Saskia Christ, Andreas Christ) -- resolve_area_approver() falls back
  // to a covers_all_areas approver when no exact area match exists.
  covers_all_areas: boolean;
  is_active: boolean;
  // Optional link to the real app_users identity this slot represents (migration
  // 20260812131000). Set by the create flow when the approver is picked from a real employee;
  // NULL for rows that predate the FK and didn't backfill-match, or that never had one. Not yet
  // used by any resolution function -- name/role remain canonical for routing (see
  // ROLES_AND_ACCESS.md §3 item 1 for why this is additive, not a full identity unification).
  app_user_id: string | null;
  created_at: string;
  updated_at: string;
  // Soft-delete trio (migration 20260813110000) -- trashed approvers appear in v_trash and are
  // filtered out of every picker. Distinct from is_active: switched off means "not right now",
  // deleted means "this entry should not exist".
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// Dynamic assignment-chain rule for one invoice's approval path. Mirrors assignment_rules' own
// "most specific scope wins" shape (migration 0025) as its own table, since the resolved value
// here is a two-step chain plus a threshold, not a single scalar.
export interface ApprovalRule {
  id: string;
  supplier_id: string | null;
  property_id: string | null;
  company_id: string | null;
  min_amount: number;
  /** Who checks. Migration 20260901160000. */
  step_1_user_id: string | null;
  // On the RESOLVED row (from resolve_approval_rule / useResolveApprovalRule), this already
  // falls back to the area-based department head when the raw rule left it empty and
  // skip_step_2 is false (migrations 0087 / 20260901160100) -- callers never need to resolve
  // that themselves.
  step_2_user_id: string | null;
  /** HISTORICAL (migration 20260901160000). The chain matched approvers(name) by string until
   *  the steps became real references. Not written any more; kept because these values are what
   *  past approvals were actually routed by. Nothing in src/ reads them. */
  step_1_approver: string | null;
  /** HISTORICAL. See step_1_approver. */
  step_2_approver: string | null;
  // True = this rule is deliberately single-step; step_2_approver stays NULL even when an area
  // approver would otherwise be available. False (default) = area auto-resolve applies.
  skip_step_2: boolean;
  specificity: number;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// DATEV handover (Briefing Screen 9, migration 0038) — one row per company x direction. `address`
// is deliberately NOT part of this type: the DB grants `authenticated` SELECT on every column
// except `address` (a "blind write" — the front-end can set/replace it but never read it back),
// so a row fetched by the app can never actually carry the real value here regardless of what the
// query asked for.
/**
 * Which DATEV upload address a row holds. DATEV issues a separate @uploadmail.datev.de address per
 * document category, and there are three per company: incoming invoices, outgoing invoices, and
 * 'other' for everything else (contracts, statements, correspondence).
 *
 * Only 'incoming' is actually sent today. 'outgoing' and 'other' are storable so the addresses live
 * in one place rather than in a password manager, which is the same reason 'outgoing' existed
 * before anything sent it either.
 */
export type DatevDirection = "incoming" | "outgoing" | "other";

/**
 * The subset the handover Edge Function can actually send. 'other' is storable but has no send
 * path: it holds the address for documents the pipeline does not produce (contracts, statements,
 * correspondence), so a caller must not be able to pass it to a trigger that would build a batch
 * from invoices. Kept as a separate type rather than a runtime guard so the compiler refuses it.
 */
export type DatevSendableDirection = Exclude<DatevDirection, "other">;

export const DATEV_DIRECTIONS: readonly DatevDirection[] = ["incoming", "outgoing", "other"];

export interface DatevRoute {
  id: string;
  company_id: string;
  direction: DatevDirection;
  is_enabled: boolean;
  note: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One receipt as the pre-send review lists it, plus whether the send will actually take it.
 *
 * `blockReason` is the whole point of this type existing. "Ready" used to be a single number that
 * counted every paid + reconciled receipt, but the send drops any whose stored file DATEV will not
 * accept — so a card promising 7 could deliver 5, with the difference reported only in a server
 * response the screen threw away. The reason is decided by `@/lib/datev/attachment-rules`, the same
 * module the send itself calls, so the preview and the send cannot disagree.
 */
export interface DatevReadyInvoice {
  id: string;
  company_id: string;
  issuer: string | null;
  invoice_number: string | null;
  document_date: string | null;
  amount_gross: number | null;
  /** null when this receipt will be sent. */
  blockReason: DatevBlockReason | null;
}

/**
 * One outgoing invoice as the send drawer lists it.
 *
 * Same shape as `DatevReadyInvoice` on purpose — a receipt with a number, a counterparty, a date, an
 * amount and possibly a reason it cannot go — so the drawer renders both directions with one
 * component instead of two that must be kept looking alike. `issuer` carries the CUSTOMER here,
 * since on an outgoing invoice the counterparty is who it was billed to.
 */
export interface DatevOutgoingInvoice {
  id: string;
  company_id: string;
  /** The customer the invoice was issued to. */
  issuer: string | null;
  invoice_number: string | null;
  document_date: string | null;
  amount_gross: number | null;
  blockReason: DatevBlockReason | null;
}

/** One company's handover state. Keyed by company id in `useDatevHandoverStatus`'s result. */
export interface DatevCompanyStatus {
  /** Paid, not yet handed over, and carrying a file DATEV accepts. */
  ready: DatevReadyInvoice[];
  /** The same rule, minus the file: these are why a send can report fewer receipts than promised. */
  blocked: DatevReadyInvoice[];
  handedOver: number;
}

// One row per send attempt (RPC/Edge Function `datev-handover`) — never the address, so a log
// leak can't leak the confidential upload address either.
export interface DatevHandoverBatch {
  id: string;
  company_id: string;
  direction: DatevDirection;
  invoice_count: number;
  total_bytes: number;
  /**
   * 'bounced' is its own outcome, not a kind of error. An errored batch never left; a bounced one
   * was accepted by the mail provider and then refused downstream, so the receipts were marked
   * handed over and have to be put BACK on the ready list. `mark_datev_batch_bounced` does exactly
   * that (migration 20260901190000).
   */
  status: "success" | "error" | "bounced";
  error_message: string | null;
  sent_by: string | null;
  created_at: string;
  bounced_at: string | null;
  /** The non-delivery report verbatim: it names the address that could not be reached. */
  bounce_reason: string | null;
  /** Set once somebody has dealt with it. Until then the batch stays on the screen. */
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

// Manually entered cost items with no receipt and no bank transaction to hang off of (Briefing
// Screen 11): personnel costs, depreciation, corporate/trade tax. category_id is required (unlike
// invoices.cost_category) — a manual item always has a clear, deliberately-chosen BWA line.
// A recurring row IS the template (period = first occurrence, recurrence_until = last or
// open-ended if null); the real table row, table `manual_bookings`, migration 0033.
export interface ManualBooking {
  id: string;
  company_id: string;
  property_id: string | null;
  category_id: string;
  period: string;
  amount: number;
  note: string | null;
  is_recurring: boolean;
  recurrence_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// One row from RPC manual_bookings_expanded — a recurring booking expanded into one row per
// calendar month it covers in the requested range. source_id always points at the template row
// (equal to its own id for a one-off item), so the UI can link an occurrence back to its template.
export interface ManualBookingExpanded {
  source_id: string;
  company_id: string;
  property_id: string | null;
  category_id: string;
  period: string;
  amount: number;
  note: string | null;
  is_recurring: boolean;
}

// One row of the Vorschläge (bulk rule suggestion) tab — RPC suggest_assignment_rules. A supplier
// not yet covered by an active cost_category rule, grouped by its most common existing category.
export interface RuleSuggestion {
  supplier_id: string;
  category_id: string | null;
  cost_category: string | null;
  receipt_count: number;
  total_receipts: number;
}

// Mail and Drive intake configuration (Briefing Screen 1; migration 0026, reworked for Stäy's
// actual providers in 0091).
//
// One row per provider. `microsoft` (Graph, accounting@staey.de) only ever uses the mail_*
// columns; `dropbox` (the StaeyBelege app folder) only ever uses the drive_* columns — Stäy's
// mailbox and filing channels run on two different providers (the pipeline's WIRING:
// MAILBOX_PROVIDER=graph, DRIVE_PROVIDER=dropbox), unlike Google which served both from one row.
// Gmail/Google Drive are not used anywhere in this stack.
//
// Every folder value is an opaque provider ID, never a display name: a Graph mailFolder id (or
// the well-known name "inbox") for `microsoft`, a path string (e.g. "/Rechnungen") for `dropbox`.
export type MailProvider = "microsoft" | "dropbox";

/** @deprecated The Hub no longer reads mail_settings. See Channel/ChannelFolder above. */
export interface MailSettings {
  provider: MailProvider;
  // Whether the pipeline reads this account at all.
  is_active: boolean;
  mailbox_address: string | null;
  mail_source_folders: string[];
  mail_processed_folder: string | null;
  // Where a not-relevant item is handed back to. Null means: leave it where it is — there is no
  // separate "actually move" switch, a chosen folder IS the opt-in.
  mail_return_folder: string | null;
  drive_source_folders: string[];
  drive_processed_folder: string | null;
  drive_return_folder: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Document sources as the pipeline holds them (channels + channel_folders) ----
//
// The store the admin panel provisions and the pipeline reads. It replaces mail_settings, which
// was the Hub's own copy of the same fact: the Hub wrote one and the pipeline read the other, so
// a folder change saved and never reached ingestion.
//
// A channel's `key` is the panel's to choose (`microsoft_365`, `dropbox`, `hub_upload` here), so
// nothing addresses a channel by a hardcoded key. `kind` is the stable word: mailbox, scan_folder,
// upload.

export type ChannelKind = "mailbox" | "scan_folder" | "upload";

/**
 * Where a folder sits in the flow. A channel has many `source` and at most one of the others.
 *
 * These are the pipeline's words, not the screen's (composition_root.py):
 *   single("handled" if channel == "mailbox" else "processed")   where a finished item goes
 *   single("not_relevant")                                        where a not-relevant item goes
 * So the "processed" folder is `handled` on a mailbox and `processed` on a scan folder. A binding
 * under any other name is stored, shown, and never obeyed.
 */
export type ChannelFolderRole = "source" | "handled" | "processed" | "not_relevant";

/** The role a finished item's folder is stored under, which differs by kind. */
export function processedRoleFor(kind: string): ChannelFolderRole {
  return kind === "mailbox" ? "handled" : "processed";
}

export interface Channel {
  key: string;
  kind: ChannelKind;
  provider: string;
  enabled: boolean;
  provider_ref: string | null;
  // The mailbox address, the Dropbox path, the upload bucket. Never a secret: those live in
  // `credentials`, which no browser can read.
  settings: Record<string, unknown> | null;
  position: number;
  updated_by: string | null;
  updated_at: string | null;
}

export interface ChannelFolder {
  channel_key: string;
  // Which connected account the binding belongs to. 'app' when the tenant authenticates as the
  // application rather than as a person.
  identity: string;
  role: ChannelFolderRole;
  external_id: string;
  // Written down when the binding is made, so a folder still reads as a name when the provider
  // cannot be reached.
  display_name: string | null;
  well_known_name: string | null;
  position: number;
}

// ---- Server-side list pagination (view v_invoices_list/v_invoices_review + RPCs, migration 0042) ----

export type BelegSortKey =
  | "steller"
  | "gesellschaft"
  | "objekt"
  | "betrag"
  | "beleg_datum"
  | "faellig"
  | "eingegangen_am"
  | "status"
  | "pruefung";

// Row from v_belege_list: all Beleg columns + two computed helpers.
export interface BelegListeRow extends Beleg {
  issuer_sort: string | null; // coalesce(supplier.name, issuer) — display + sort
  review_score: number | null; // server-computed review priority (mirrors pruefScore)
  // Bank-reconciliation flags (migration 20260813170000). Undecided ('kandidat' or 'auto') counts
  // as SUGGESTED, not confirmed -- the matcher writes 'auto' without asking, so a human still has
  // to look. Both false means no bank transaction is linked at all.
  has_suggested_bank_match: boolean;
  has_confirmed_bank_match: boolean;
}

// All list controls resolved to server-ready values. `von`/`bis` are the beleg_datum
// range already derived from the period selection.
export interface BelegeListeParams {
  q?: string;
  // Ids matched by the AI natural-language search (askInvoiceQuestion). Undefined = no AI search
  // active. An empty array is deliberately NOT "no filter" — it means the AI search found nothing,
  // so the list must show nothing, not silently fall back to the unfiltered set.
  ids?: string[];
  gesellschaft?: string;
  objekt?: string;
  status?: string;
  belegart?: string;
  zahlung?: string;
  // Approval-chain stage (workflow_status, migration 0035/0036) — a separate axis from `status`
  // (AI review) and `zahlung` (paid or not): a receipt can be fully recognized and unpaid while
  // sitting at any step from "eingegangen" through "abgeschlossen".
  workflow?: string;
  // Whether the invoice has been handed over to DATEV yet (datev_handed_over_at) — a separate
  // axis from `zahlung`/`status`, mirroring how workflow_status='uebergeben_datev' is itself
  // derived from this column (migration 0038), not the other way around.
  datev?: string;
  // Recognition traffic light (traffic_light column): 'gruen' | 'gelb' | 'rot'. Separate axis from
  // `status`, and the reason yellow receipts were unreachable before: the AI flags them for a
  // human nod but the pipeline still leaves status='erkannt', so no status filter ever showed them.
  ampel?: string;
  // Whether a bank transaction has been reconciled against this invoice, and whether that match is
  // still open. 'vorschlag' = a suggestion (status kandidat or auto) nobody has decided on yet,
  // 'zugeordnet' = confirmed. Its own axis, separate from `zahlung`: an invoice can be marked paid
  // with no bank match at all, and can have a suggestion while still unpaid.
  bankMatch?: string;
  paymentType?: string;
  // Archived receipts (wrongly ingested, kept with a warning note) are out of everyday lists.
  // 'nur' shows only the archive; undefined excludes it.
  archiv?: "nur";
  von?: string;
  bis?: string;
  // due_date band, already resolved to dates by dueFilterRange(). faelligUnbekannt is the
  // "no due date at all" band, which no range can express.
  faelligVon?: string;
  faelligBis?: string;
  faelligUnbekannt?: boolean;
  sort: BelegSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

// Filters only (for KPIs / Kanban) — no sort/paging.
export type BelegeFilter = Omit<BelegeListeParams, "sort" | "dir" | "page" | "pageSize">;

export interface BelegeSeite {
  rows: BelegListeRow[];
  total: number;
  /**
   * Set when the requested page was past the end and the query fell back to the last page that
   * exists. The list uses it to correct the URL, so a bookmarked `?page=9` from back when there
   * were more results lands on the last real page instead of a database error.
   */
  angepassteSeite?: number;
}

export interface BelegeKpis {
  total: number;
  erkannt: number;
  zu_pruefen: number;
  volumen: number;
  /**
   * Gross sum of the rows in view that are NOT paid yet. What is still going out the door.
   *
   * null on a database that has not run migration 20260815210000, whose invoices_kpis does not
   * return the column. The tile is then left out entirely: a 0 beside a non-zero volume reads as a
   * real figure, and nothing on screen would say it is not one.
   */
  offen: number | null;
  /**
   * True when the counts were taken WITHOUT the AI-search / ampel / archiv filters, because the
   * database has not run migration 20260815160000 yet and its invoices_kpis takes no parameter for
   * them. The list still applies all three, so the page has to say the tiles are counting a wider
   * set. False means tiles and list are counting exactly the same rows.
   */
  partial: boolean;
}

export interface BelegeFacets {
  objekt_codes: string[];
  belegarten: string[];
  months: string[];
  years: string[];
}

export interface BelegDatei {
  id: string;
  document_id: string;
  role: "original" | "xml" | "rendered" | string;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  // PostgREST liefert bytea als Hex-String "\\x...". Null once the pipeline stops dual-writing
  // (Supabase Storage becomes the only store, see docs/FILE_STORAGE.md) — still populated on
  // rows ingested before that cutover, which have no storage_bucket/storage_path yet.
  content: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface VerarbeitungsLog {
  id: number;
  source_item_id: string | null;
  subject: string | null;
  sender: string | null;
  status: string | null;
  reason: string | null;
  document_id: string | null;
  processed_at: string;
  body: string | null;
  sent_at: string | null;
}

// ---- Pipeline-Lauf-Heartbeat (Health-Panel) ----
// Mirrors supabase/migrations/0013_pipeline_runs.sql in the pipeline repo. Written by the Python
// ingest runs (email/drive/upload); the front-end only reads it for the Übersicht health card.
export interface PipelineRun {
  id: string;
  source: string; // 'email' | 'drive' | 'upload'
  status: string; // 'running' | 'ok' | 'error'
  started_at: string;
  finished_at: string | null;
  processed_count: number;
  error_count: number;
  ai_calls: number;
  note: string | null;
}

// One press of "Jetzt ausfuehren". The Hub writes it, the pipeline reads it and writes back what
// it found. See the book-keeping repo, migrations/tenant/0009_run_requests.sql.
export interface RunRequest {
  id: string;
  // The tenant's channel key as the pipeline's config spells it: mailbox, scan_folder, upload.
  channel: string;
  status: "pending" | "running" | "done" | "failed";
  processed_count: number;
  error_count: number;
  // What it found, or why it could not run. Shown on the card as it stands.
  note: string | null;
  requested_at: string;
  // The folders somebody picked for this run, or null for the channel's usual ones (migration 0012).
  folders?: string[] | null;
  folder_names?: string[] | null;
}

export interface PipelineHealth {
  lastRun: PipelineRun | null;
  running: boolean; // an open run row (status='running', no finished_at)
  errorCount: number; // errors in the most recent run
  runs: PipelineRun[]; // recent runs (newest first)
}

// ---- BANKSapi bank reconciliation (Phase 1, read-only) ----
// Mirrors supabase/migrations/0001_bank_reconciliation.sql. Populated by the
// bank-sync Edge Function; the front-end only reads these + writes matches.

export type BankConnectionStatus = "pending" | "active" | "error" | "expired";
export type TransactionMatchingStatus = "offen" | "zugeordnet" | "ignoriert";
export type TransactionRichtung = "eingehend" | "ausgehend";
export type MatchStatus = "kandidat" | "auto" | "bestaetigt" | "abgelehnt";
// Derived per-beleg reconciliation summary (computed from matches — NOT stored on belege).
export type AbgleichStatus = "offen" | "teilweise" | "abgeglichen";

export interface BankConnection {
  id: string;
  banksapi_access_id: string | null;
  banksapi_user: string | null;
  provider_id: string | null;
  provider_name: string | null;
  bank_name: string | null;
  status: string;
  is_sandbox: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  // Set = the BANKSapi access was deleted from the Hub (migration 20260902170000). The connection,
  // its accounts and their transactions are kept as history and the accounts are switched off, so
  // nothing new arrives. Distinct from status 'expired', which is a consent the BANK withdrew and
  // that a re-authorisation would fix.
  disconnected_at: string | null;
  /**
   * Who started this connection, and so whose bank consent it is to renew when it expires
   * (migration 20260915100000). Null on connections made before that was recorded.
   */
  connected_by: string | null;
  connected_by_email: string | null;
  /** The live account behind connected_by, joined by useBankConnections. */
  connected_by_user?: { name: string | null; email: string | null } | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  connection_id: string | null; // null = entered by hand, no BANKSapi connection (20260901100000)
  company_id: string | null; // owning company (FK gesellschaften.id); transactions inherit it (0016/0017)
  banksapi_product_id: string | null;
  banksapi_provider_id: string | null; // BANKSapi provider uuid for the connect step (0016)
  provider_id: string | null; // FK bank_providers.id (0028); null = no linked provider
  connect_route: "banksapi" | "ebics_or_manual" | null; // trigger-derived from provider_id (0028)
  account_name: string | null;
  iban: string | null;
  bic: string | null;
  holder: string | null;
  bank_name: string | null; // Kreditinstitut (0016)
  product_type: string | null;
  currency: string | null;
  balance: number | null;
  balance_date: string | null;
  is_own_account: boolean;
  is_sandbox: boolean;
  // false = switched off in the Hub (migration 20260902160000). bank-sync keeps the row and its
  // history but stops fetching NEW movements for it. The gentle counterpart to excluded_at below:
  // reversible, destroys nothing, and it exists because a provider-fed account cannot be deleted at
  // all -- BANKSapi has no per-account DELETE, so the next sync would upsert it straight back.
  is_active: boolean;
  // Set = an admin removed this account in the Hub ("Konto entfernen"): its movements were purged
  // and bank-sync never imports the product again (migration 20260815120000). Stronger than
  // deleted_at, which the sync is allowed to undo when the bank keeps delivering the account.
  excluded_at: string | null;
  excluded_by: string | null; // email of the admin who removed it
  exclusion_reason: string | null;
  // Set = account_name was chosen by a human; the BANKSapi feed must not overwrite it. Without
  // this every rename was reset to the bank's own label ("Sichteinlagen") on the next hourly sync.
  name_is_custom: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type PaymentOrderStatus =
  "draft" | "pending_sca" | "authorized" | "executed" | "failed" | "cancelled";

// One BANKSapi payment ATTEMPT for one invoice (migration 0081,
// docs/BANKSAPI_PAYMENT_INITIATION.md). Recipient fields are a SNAPSHOT taken at trigger time
// (never live-joined to suppliers), so a later IBAN change on the supplier never retroactively
// changes what an already-submitted payment's audit record says was paid. A retried payment after
// a failure is a NEW row, not an update of this one.
export interface PaymentOrder {
  id: string;
  document_id: string;
  company_id: string | null;
  recipient_name: string | null;
  recipient_iban: string;
  recipient_bic: string | null;
  amount: number;
  currency: string;
  payment_reference: string | null;
  status: PaymentOrderStatus;
  status_reason: string | null;
  banksapi_access_id: string | null;
  banksapi_product_id: string | null;
  banksapi_payment_id: string | null;
  is_sandbox: boolean;
  idempotency_key: string;
  // Fraud signal (a supplier IBAN changed within the lookback window at trigger time -- see
  // IBAN_CHANGE_LOOKBACK_DAYS in payment-initiate). Surfaced as a hard-stop in the confirmation
  // dialog, not a dismissible toast.
  recipient_iban_changed_recently: boolean;
  fraud_flags: Record<string, unknown> | null;
  initiated_by: string | null;
  initiated_at: string;
  authorized_at: string | null;
  executed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// Movement type driving reconciliation (migration 0023, check constraint on
// bank_transactions.transaction_type). Each one is handled differently downstream: a transfer
// is pushed by hand and needs approval before it is paid, a credit card debit is one lumped
// charge that gets split back into its purchases, a direct debit was already pulled and only
// needs the lighter check. Mirrors TransactionType in
// supabase/functions/_shared/transaction-type.ts. Keep the two in step.
export type TransactionType =
  "ueberweisung" | "lastschrift" | "kreditkarte" | "kartenzahlung" | "gutschrift" | "unbekannt";

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  "ueberweisung",
  "lastschrift",
  "kreditkarte",
  "kartenzahlung",
  "gutschrift",
  "unbekannt",
];

export interface BankTransaction {
  id: string;
  account_id: string;
  company_id?: string | null;
  connection_id: string;
  banksapi_hash: string;
  source: string | null; // provenance of the row (migration 0073): 'banksapi' | 'pleo' | ...
  amount: number; // signed: negative = money out, positive = in
  currency: string | null;
  booking_date: string | null;
  value_date: string | null;
  payment_reference: string | null;
  booking_text: string | null;
  counterparty_holder: string | null;
  counterparty_iban: string | null;
  counterparty_bic: string | null;
  // Who made the payment. Pleo only; null on banksapi/manual (migration 20260901190000).
  spender_name: string | null;
  spender_email: string | null;
  direction: string | null; // generated: 'ausgehend' | 'eingehend'
  // Normalized movement type (migration 0023). Derived by the classifier in
  // supabase/functions/_shared/transaction-type.ts, NOT by the bank. booking_text is the bank's
  // own free text and is empty on most movements. null = not yet classified, and the next
  // bank-sync run fills it.
  transaction_type: TransactionType | null;
  transaction_type_source: "auto" | "manuell";
  matching_status: string;
  /**
   * Set when somebody declared the payment spent even though part of it is unallocated
   * (migration 20260910190000). sync_transaction_matching_status reads it, otherwise the remainder
   * would recompute the status back to 'offen' on the next write.
   */
  fully_used_at: string | null;
  fully_used_by: string | null;
  fully_used_note: string | null;
  /**
   * What Pleo says this spend is (migration 20260914100000). Both are Pleo's own ids and are
   * rewritten on every sync; resolve them through `pleo_tags` and `pleo_accounts` to a Hub
   * property and BWA category. Null on anything that did not come from Pleo.
   */
  pleo_tag_id: string | null;
  pleo_account_id: string | null;
  is_sandbox: boolean;
  raw_data: Record<string, unknown> | null;
  imported_at: string;
  created_at: string;
  // OPOS whitelist provenance (migration 0018). Set together with matching_status='ignoriert'.
  // whitelist_rule_id null while hidden = a HUMAN decided it; rules never touch those.
  no_receipt_reason: OposCategory | null;
  whitelist_rule_id: string | null;
  no_receipt_set_by: string | null;
  no_receipt_set_at: string | null;
  // Category for a transaction with no receipt of its own (migration 0057). 'rule' = written
  // automatically by the categorize trigger from a learned supplier/reference rule; 'human' = set
  // or overridden via opos_set_category(). A matched transaction is still categorized through its
  // linked invoice, not this column.
  category_id: string | null;
  category_source: "rule" | "human" | null;
  // Attached by useBankTransactionsPage, not a column: an undecided match (kandidat/auto)
  // exists for this transaction. matching_status stays 'offen' while a suggestion is pending.
  has_suggested_match?: boolean;
  /**
   * A document hangs off the transaction itself (invoice_files.transaction_id, migration 0074):
   * the Pleo card receipt, not an invoice matched to it. Attached per page by
   * useBankTransactionsPage; absent on rows read through other hooks.
   */
  has_document?: boolean;
  /** Where that document came from ('pleo', an upload, …). Null when unknown. */
  document_source?: string | null;
}

export interface MatchReasons {
  amount?: boolean;
  /**
   * The amounts agree only BECAUSE of the allowed difference, not to the cent. Recorded so the
   * screen can say so: "matches within your 0,50 € allowance" is a different claim from "matches",
   * and the person confirming the link is the one who should weigh it.
   */
  amountTolerated?: boolean;
  /** How far apart they actually were, in euros. Null when the amounts do not agree at all. */
  amountDifference?: number | null;
  reference?: boolean;
  customerNumber?: boolean;
  iban?: boolean;
  name?: boolean;
  dayDiff?: number | null;
  manual?: boolean;
  [feld: string]: unknown;
}

export interface BelegTransactionMatch {
  id: string;
  document_id: string;
  transaction_id: string;
  status: string;
  score: number | null;
  match_reasons: MatchReasons | null;
  // How much of the transaction is allocated to THIS invoice (migration 0024). For a plain 1:1
  // match it equals the transaction amount; for a collective payment the links across its invoices
  // add up to the transaction, and for installments the links across transactions add up to the
  // invoice. Coverage must be summed from THIS, never from bank_transactions.amount.
  amount_matched: number;
  difference_reason?: string | null;
  matched_by: string | null;
  matched_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  // Optional PostgREST-embedded relations (select "*, bank_transactions(*)" / "*, documents(*)").
  // An embedded row arrives under its TABLE name, so this key moved with the rename to documents.
  bank_transactions?: BankTransaction | null;
  documents?: Beleg | null;
}

export interface MatchingSettings {
  id: boolean;
  amount_tolerance: number;
  auto_match_threshold: number;
  candidate_threshold: number;
  created_at?: string;
  updated_at?: string;
}

// Outgoing-invoice side of bank matching (migration 0045) -- mirrors BelegTransactionMatch for the
// opposite direction (an outgoing invoice / revenue, linked to an incoming credit transaction).
export interface OutgoingInvoiceTransactionMatch {
  id: string;
  outgoing_invoice_id: string;
  transaction_id: string;
  status: string;
  score: number | null;
  match_reasons: MatchReasons | null;
  amount_matched: number;
  difference_reason?: string | null;
  matched_by: string | null;
  matched_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  bank_transactions?: BankTransaction | null;
  outgoing_invoices?: OutgoingInvoice | null;
}

export interface BankSyncLog {
  id: number;
  run_id: string | null;
  connection_id: string | null;
  event: string;
  level: string;
  message: string | null;
  counts: Record<string, number> | null;
  created_at: string;
}

// ---- Outgoing invoices & customers (Briefing Screen 15; migration 0052) ----
// Originally a LexOffice-backed mirror; LexOffice was removed entirely (migration 0086) — no
// real Stäy company ever had an account. 'app' = created directly in the Hub (e.g. /kunden),
// 'upload' = created alongside an uploaded outgoing invoice
// (src/lib/api/outgoing-invoice-upload.functions.ts, migration 0085).
export type CustomerSource = "app" | "upload";

export interface Customer {
  id: string;
  company_id: string;
  is_company: boolean;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country_code: string;
  vat_id: string | null;
  customer_number: string | null;
  normalized_name: string | null;
  source: CustomerSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

// "Überfällig" (overdue) is not a stored status; it's derived on the client from
// `voucher_status === "open" && due_date < today` (see format.ts).
export type OutgoingVoucherStatus = "draft" | "open" | "paidoff" | "voided";

export interface OutgoingInvoiceLineItem {
  description: string;
  quantity: number;
  unit_name: string;
  amount_net: number;
  vat_rate: number;
  amount_gross: number;
}

export interface OutgoingInvoice {
  // Optional on this Hub: only present where LexOffice sync exists. undefined reads as null.
  lexoffice_voucher_id?: string | null;
  id: string;
  company_id: string;
  customer_id: string;
  voucher_number: string | null;
  voucher_status: OutgoingVoucherStatus;
  voucher_date: string | null;
  due_date: string | null;
  amount_net: number | null;
  amount_gross: number | null;
  currency: string;
  // Never populated by the current (upload-only) creation path — totals only, no line-item
  // breakdown. Kept as a column/type for a future structured-upload pass, not actively used.
  line_items: OutgoingInvoiceLineItem[] | null;
  // Always "upload" (migration 0086) — LexOffice removed entirely, so there is no other way an
  // outgoing invoice enters this table.
  source: "upload";
  // Who last set voucher_status: 'auto' (a confirmed bank match) or 'manual'
  // (set_uploaded_outgoing_invoice_status, migration 0085).
  status_source: "auto" | "manual" | null;
  dunning_level: number | null;
  dunning_due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  // Optional PostgREST-embedded relation (select "*, customers(*)").
  customers?: Customer | null;
}

// One stored file per uploaded outgoing invoice — table `outgoing_invoice_files` (migration 0085).
export interface OutgoingInvoiceFile {
  id: string;
  outgoing_invoice_id: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;
  checksum_sha256: string | null;
  created_by: string | null;
  created_at: string;
}

// Team & Rollen (Briefing Screen 17, Appendix A7). Mirrors the AppRole union in src/lib/auth.tsx
// (kept as a single import there rather than duplicated as a literal union here).
export interface Employee {
  id: string;
  email: string;
  name: string | null;
  role_id: string;
  role_name: AppRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  // Company ids this employee is explicitly granted. Empty = unrestricted (has_company_access's
  // "no grants recorded" default), not "sees nothing" -- the same convention the DB itself uses.
  allowed_company_ids: string[];
  // Three itemized accounting capabilities (migration 20260812150000), independent of role_name
  // and of the separate `approvers` table -- see that migration's comment for why they're split.
  /** Effective permission keys: personal overrides merged over the role's defaults, the same rule
   *  current_permissions() applies server-side. Replaced the can_book/can_approve/can_pay columns,
   *  which no code read and which the role silently overrode. */
  permissions: string[];
  /** Who covers for this person while they are away. Display only: the deputy is NAMED in the
   *  overdue warning, they are not granted anything by it. Migration 20260901160000. */
  deputy_user_id: string | null;
  /** After how many days without approval-chain movement a receipt waiting on this person reads
   *  as overdue. NULL = no overdue warning for them. */
  escalation_days: number | null;
  /** The area this person signs off for. Feeds resolve_area_user(), which fills a rule's empty
   *  step 2. Mutually exclusive with covers_all_areas. */
  area: ApprovalArea | null;
  /** Signs off for every area; the fallback when no exact area owner is active. */
  covers_all_areas: boolean;
}

// Papierkorb (Briefing Screen 18) -- one row per soft-deleted record, from the v_trash view
// (migration 0047), which normalizes across every trash-eligible table.
export interface TrashRecord {
  table_name: string;
  id: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
  delete_reason: string | null;
}
