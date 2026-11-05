import { getBanksapi, getBanksapiForPayments } from "./client.ts";
import type {
  GenericAccessSession,
  GenericBankAccount,
  GenericBankTransaction,
  GenericPaymentSession,
  GenericPaymentStatus,
  IBankingAdapter,
} from "../../banking-adapter.ts";

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
  const payments = getBanksapiForPayments();
  return {
    providerKey: "banksapi",
    mode: api.mode,
    paymentMode: payments.mode,
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
    async createAccessSession(callbackUrl, customerIp): Promise<GenericAccessSession> {
      const session = await api.createBankAccessSession(callbackUrl, customerIp);
      return { webformUrl: session.webformUrl, accessRef: session.accessId };
    },
    async deleteAccess(accessRef) {
      await api.deleteBankAccess(accessRef);
    },
    async initiatePayment(
      accessRef,
      accountRef,
      request,
      callbackUrl,
      customerIp,
    ): Promise<GenericPaymentSession> {
      const session = await payments.initiatePayment(
        accessRef,
        accountRef,
        request,
        callbackUrl,
        customerIp,
      );
      return {
        paymentRef: session.paymentId,
        status: session.status,
        webformUrl: session.webformUrl,
      };
    },
    async getPaymentStatus(accessRef, paymentRef): Promise<GenericPaymentStatus> {
      return await payments.getPaymentStatus(accessRef, paymentRef);
    },
  };
}
