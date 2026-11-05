import type { Supplier } from "@/lib/data/types";
import { SUPPLIERS, sampleId } from "../shared";

/**
 * One supplier with a confirmed bank account, one with none, one a duplicate spelling would merge
 * into: the three states the suppliers screen draws differently.
 */
export const suppliers: Supplier[] = [
  {
    id: SUPPLIERS[0].id,
    name: SUPPLIERS[0].name,
    iban: "DE02120300000000202051",
    vat_id: "DE136695976",
    created_at: "2026-01-09T09:00:00Z",
  } as Supplier,
  {
    id: SUPPLIERS[1].id,
    name: SUPPLIERS[1].name,
    vat_id: "DE123475223",
    created_at: "2026-02-14T11:30:00Z",
  } as Supplier,
  {
    id: SUPPLIERS[2].id,
    name: SUPPLIERS[2].name,
    iban: "DE89370400440532013000",
    created_at: "2026-03-01T08:15:00Z",
  } as Supplier,
];

/** One confirmed, payable account per supplier that has an IBAN on file. */
export const supplierBankAccounts = [
  {
    id: sampleId(21, 1),
    supplier_id: SUPPLIERS[0].id,
    iban: "DE02120300000000202051",
    bic: null,
    bank_name: null,
    source: "pipeline",
    is_active: true,
    is_default: true,
    is_payable: true,
    first_seen_at: "2026-01-09T09:00:00Z",
    last_seen_at: "2026-09-14T08:12:00Z",
    confirmed_at: "2026-01-09T09:05:00Z",
    confirmed_by: "owner@example.com",
    created_by: null,
  },
  {
    id: sampleId(21, 2),
    supplier_id: SUPPLIERS[2].id,
    iban: "DE89370400440532013000",
    bic: null,
    bank_name: null,
    source: "pipeline",
    is_active: true,
    is_default: true,
    is_payable: true,
    first_seen_at: "2026-03-01T08:15:00Z",
    last_seen_at: "2026-08-30T16:05:00Z",
    confirmed_at: "2026-03-01T08:20:00Z",
    confirmed_by: "owner@example.com",
    created_by: null,
  },
];

/** Which document first brought each supplier's bank account in -- the detail page's provenance line. */
export const documentBankAccounts = [
  {
    document_id: sampleId(30, 1),
    supplier_bank_account_id: supplierBankAccounts[0].id,
    position: 1,
    origin: "pipeline",
    first_seen_at: "2026-09-14T08:12:00Z",
    created_at: "2026-09-14T08:12:00Z",
  },
  {
    document_id: sampleId(30, 3),
    supplier_bank_account_id: supplierBankAccounts[1].id,
    position: 1,
    origin: "pipeline",
    first_seen_at: "2026-08-30T16:05:00Z",
    created_at: "2026-08-30T16:05:00Z",
  },
];

/** One IBAN change, so the fraud-signal banner on payment has something to flag. */
export const supplierIbanHistory = [
  {
    id: sampleId(22, 1),
    supplier_id: SUPPLIERS[0].id,
    old_iban: "DE02120300000000111111",
    new_iban: "DE02120300000000202051",
    changed_by: "owner@example.com",
    source: "manual",
    note: null,
    changed_at: "2026-08-20T10:00:00Z",
  },
];
