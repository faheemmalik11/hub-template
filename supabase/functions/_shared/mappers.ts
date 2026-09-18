// Map BANKSapi-shaped objects into our DB row shapes. Same mapping in mock and live.
import type { BanksapiAccess, BanksapiAccount, BanksapiTransaction } from "./banksapi.ts";
import { classifyTransactionType } from "./transaction-type.ts";

// BANKSapi sends dates as "YYYY-MM-DD HH:MM:SS"; our columns are `date`.
function dateOnly(value: string | null | undefined): string | null {
  return value ? String(value).slice(0, 10) : null;
}

// is_sandbox is NOT set here on purpose. It is decided once, at the moment a connection is
// first created (bank-connect, or bank-sync's fallback insert for an access BANKSapi reports
// that we don't already have a row for) and never touched again — see bank-sync's
// connectionIsSandbox for why re-deriving it on every sync was the bug.
export function connectionRow(access: BanksapiAccess) {
  return {
    banksapi_access_id: access.accessId,
    provider_id: access.providerId,
    provider_name: access.providerName,
    bank_name: access.bankName,
    status: "active",
    updated_at: new Date().toISOString(),
  };
}

export function accountRow(connectionId: string, a: BanksapiAccount, isSandbox: boolean) {
  return {
    connection_id: connectionId,
    banksapi_product_id: a.produktId,
    account_name: a.kontoName,
    iban: a.iban || null,
    bic: a.bic || null,
    holder: a.inhaber || null,
    product_type: a.produktTyp || null,
    bank_name: a.kreditinstitut || null,
    currency: a.waehrung || "EUR",
    balance: a.saldo ?? null,
    balance_date: a.saldoDatum || null,
    is_own_account: a.eigenesKonto ?? true,
    is_sandbox: isSandbox,
    updated_at: new Date().toISOString(),
  };
}

export function transactionRow(
  accountId: string,
  connectionId: string,
  t: BanksapiTransaction,
  isSandbox: boolean,
  // bank_accounts.product_type of the account this movement sits on. The classifier needs it to
  // tell a single card movement (on a card account) from the collective card debit.
  productType?: string | null,
) {
  return {
    account_id: accountId,
    connection_id: connectionId,
    banksapi_hash: t.hash,
    amount: t.betrag,
    currency: t.waehrung || "EUR",
    booking_date: dateOnly(t.buchungsdatum),
    value_date: dateOnly(t.wertstellungsdatum),
    payment_reference: t.verwendungszweck || null,
    booking_text: t.buchungstext || null,
    counterparty_holder: t.gegenkontoInhaber || null,
    counterparty_iban: t.gegenkontoIban || null,
    counterparty_bic: t.gegenkontoBic || null,
    transaction_type: classifyTransactionType({
      bookingText: t.buchungstext,
      paymentReference: t.verwendungszweck,
      amount: t.betrag,
      productType,
    }),
    transaction_type_source: "auto",
    is_sandbox: isSandbox,
    raw_data: t as unknown as Record<string, unknown>,
  };
}
