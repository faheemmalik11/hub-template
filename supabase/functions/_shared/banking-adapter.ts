export interface GenericBankAccount {
  providerAccountRef: string;
  providerRef: string | null;
  accountName: string | null;
  iban: string | null;
  bic: string | null;
  holder: string | null;
  bankName: string | null;
  currency: string;
  balance: number | null;
  balanceDate: string | null;
  isOwnAccount: boolean;
}

export interface GenericBankTransaction {
  providerHash: string;
  amount: number;
  currency: string;
  bookingDate: string | null;
  valueDate: string | null;
  paymentReference: string | null;
  bookingText: string | null;
  counterpartyHolder: string | null;
  counterpartyIban: string | null;
  counterpartyBic: string | null;
  raw: Record<string, unknown>;
}

export interface IBankingAdapter {
  readonly providerKey: string;
  listAccounts(accessRef: string): Promise<GenericBankAccount[]>;
  listTransactions(
    accessRef: string,
    accountRef: string,
    since: string | null,
  ): Promise<GenericBankTransaction[]>;
}

export interface CardSpender {
  key: string;
  name: string | null;
  email: string | null;
  count: number;
  total: number;
  lastBooking: string | null;
}

export interface ICardAdapter {
  readonly providerKey: string;
  listSpenders(): Promise<CardSpender[]>;
}
