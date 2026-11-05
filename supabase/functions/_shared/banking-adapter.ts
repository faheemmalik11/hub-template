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

export interface GenericAccessSession {
  webformUrl: string;
  accessRef: string;
}

export interface GenericPaymentRequest {
  recipientIban: string;
  recipientBic?: string;
  recipientName: string;
  amount: number;
  currency: string;
  reference: string;
  endToEndId: string;
}

export interface GenericPaymentSession {
  paymentRef: string;
  status: string;
  webformUrl?: string;
}

export interface GenericPaymentStatus {
  status: string;
  reason?: string;
}

export interface IBankingAdapter {
  readonly providerKey: string;
  readonly mode: "mock" | "live";
  readonly paymentMode: "mock" | "live";
  listAccounts(accessRef: string): Promise<GenericBankAccount[]>;
  listTransactions(
    accessRef: string,
    accountRef: string,
    since: string | null,
  ): Promise<GenericBankTransaction[]>;
  createAccessSession(callbackUrl: string, customerIp: string): Promise<GenericAccessSession>;
  deleteAccess(accessRef: string): Promise<void>;
  initiatePayment(
    accessRef: string,
    accountRef: string,
    request: GenericPaymentRequest,
    callbackUrl: string,
    customerIp: string,
  ): Promise<GenericPaymentSession>;
  getPaymentStatus(accessRef: string, paymentRef: string): Promise<GenericPaymentStatus>;
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
