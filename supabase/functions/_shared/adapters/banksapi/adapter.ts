import { getBanksapi } from "./client.ts";
import type { GenericBankAccount, GenericBankTransaction, IBankingAdapter } from "../../banking-adapter.ts";

function toGenericAccount(a: {
  produktId: string;
  kontoName: string;
  iban: string | null;
  bic: string | null;
  inhaber: string | null;
  kreditinstitut: string;
  waehrung?: string;
  saldo: number | null;
  saldoDatum: string | null;
  eigenesKonto?: boolean;
}): GenericBankAccount {
  return {
    providerAccountRef: a.produktId,
    providerRef: null,
    accountName: a.kontoName,
    iban: a.iban,
    bic: a.bic,
    holder: a.inhaber,
    bankName: a.kreditinstitut,
    currency: a.waehrung ?? "EUR",
    balance: a.saldo,
    balanceDate: a.saldoDatum,
    isOwnAccount: a.eigenesKonto ?? true,
  };
}

function toGenericTransaction(t: {
  hash: string;
  betrag: number;
  waehrung?: string;
  buchungsdatum: string | null;
  wertstellungsdatum: string | null;
  verwendungszweck?: string | null;
  buchungstext?: string | null;
  gegenkontoInhaber?: string | null;
  gegenkontoIban?: string | null;
  gegenkontoBic?: string | null;
}): GenericBankTransaction {
  return {
    providerHash: t.hash,
    amount: t.betrag,
    currency: t.waehrung ?? "EUR",
    bookingDate: t.buchungsdatum,
    valueDate: t.wertstellungsdatum,
    paymentReference: t.verwendungszweck ?? null,
    bookingText: t.buchungstext ?? null,
    counterpartyHolder: t.gegenkontoInhaber ?? null,
    counterpartyIban: t.gegenkontoIban ?? null,
    counterpartyBic: t.gegenkontoBic ?? null,
    raw: t as unknown as Record<string, unknown>,
  };
}

export function banksapiAdapter(): IBankingAdapter {
  const api = getBanksapi();
  return {
    providerKey: "banksapi",
    async listAccounts(accessRef) {
      const accesses = await api.getBankAccesses();
      const access = accesses.find((a) => a.accessId === accessRef);
      return (access?.bankprodukte ?? []).map(toGenericAccount);
    },
    async listTransactions(accessRef, accountRef, since) {
      const transactions = await api.getTransactions(accessRef, accountRef, {
        from: since,
      });
      return transactions.map(toGenericTransaction);
    },
  };
}
