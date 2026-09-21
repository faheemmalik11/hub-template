import type { BankAccount } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

const base = {
  provider_account_ref: null,
  provider_ref: null,
  provider_id: null,
  bic: null,
  product_type: "current",
  currency: "EUR",
  excluded_at: null,
  excluded_by: null,
  exclusion_reason: null,
  metadata: null,
  is_own_account: true,
  is_sandbox: false,
  is_active: true,
  name_is_custom: false,
  created_at: "2026-01-12T09:00:00Z",
  updated_at: "2026-09-21T06:00:00Z",
};

/**
 * One account synced from a bank and one entered by hand, which is the difference the accounts
 * screen groups by: a connection has a header and a sync state, a manual account has neither.
 */
export const bankAccounts: BankAccount[] = [
  {
    ...base,
    id: sampleId(70, 1),
    connection_id: sampleId(71, 1),
    connect_route: "banksapi",
    company_id: COMPANIES[0].id,
    account_name: "Geschäftskonto",
    iban: "DE02100500000054540402",
    holder: COMPANIES[0].name,
    bank_name: "Berliner Sparkasse",
    balance: 18450.22,
    balance_date: "2026-09-21",
  },
  {
    ...base,
    id: sampleId(70, 2),
    connection_id: null,
    connect_route: "ebics_or_manual",
    company_id: COMPANIES[1].id,
    account_name: "Mietkonto",
    iban: "DE89370400440532013000",
    holder: COMPANIES[1].name,
    bank_name: "Commerzbank",
    balance: 6120.5,
    balance_date: "2026-09-20",
    name_is_custom: true,
  },
];
