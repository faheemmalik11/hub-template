export type CreditTransferVersion =
  "pain.001.001.02" | "pain.001.001.03" | "pain.001.001.08" | "pain.001.001.09";

export type ExecutionDateRule = "as_soon_as_possible" | "on_due_date";

export interface Payer {
  name: string;
  iban: string;
  bic?: string | null;
}

export interface TransferRequest {
  reference: string;
  recipientName?: string | null;
  iban?: string | null;
  bic?: string | null;
  amount?: number | null;
  currency?: string | null;
  remittance?: string | null;
  dueDate?: string | null;
  isDirectDebit?: boolean;
  accountConfirmed?: boolean;
  alreadyInAnotherRun?: boolean;
}

export type RejectionReason =
  | "no_bank_account"
  | "account_not_confirmed"
  | "iban_invalid"
  | "iban_outside_sepa"
  | "bic_invalid"
  | "bic_country_mismatch"
  | "amount_missing"
  | "amount_above_maximum"
  | "currency_not_euro"
  | "direct_debit"
  | "already_in_another_run"
  | "recipient_name_empty"
  | "duplicate_reference";

export type BlockingReason =
  | "payer_name_empty"
  | "payer_iban_invalid"
  | "payer_bic_invalid"
  | "payer_bic_country_mismatch"
  | "version_unsupported"
  | "nothing_to_transfer";

export type RepairKind =
  | "name_transliterated"
  | "name_shortened"
  | "remittance_transliterated"
  | "remittance_shortened"
  | "remittance_replaced_by_reference"
  | "amount_rounded_to_cent"
  | "execution_date_moved";

export interface Repair {
  kind: RepairKind;
  before: string;
  after: string;
}

export interface Rejection {
  reference: string;
  recipientName: string;
  reason: RejectionReason;
}

export interface Blocker {
  reason: BlockingReason;
}

export interface AcceptedTransfer {
  reference: string;
  endToEndId: string;
  recipientName: string;
  iban: string;
  bic: string | null;
  amountCents: number;
  remittance: string;
  executionDate: string;
  repairs: Repair[];
}

export interface PreparedRun {
  accepted: AcceptedTransfer[];
  rejected: Rejection[];
  blocker: Blocker | null;
  totalCents: number;
}

export interface PaymentFile {
  fileName: string;
  messageId: string;
  content: string;
  transferCount: number;
  totalCents: number;
}

export interface BuiltPaymentRun extends PreparedRun {
  files: PaymentFile[];
}

export interface SepaSettings {
  version: CreditTransferVersion;
  batchBooking: boolean;
  executionDateRule: ExecutionDateRule;
  maxTransfersPerFile: number | null;
  maxAmountCents: number;
  sepaCountries: readonly string[];
  extraClosingDays: readonly string[];
  transliteration: Readonly<Record<string, string>>;
}

export interface BuildOptions {
  payer: Payer;
  transfers: readonly TransferRequest[];
  messageId: string;
  today: string;
  settings?: Partial<SepaSettings>;
}
