import { centsToAmount, hasSubCentPrecision, toCents } from "./amount";
import { bicMatchesIban, isBicValid, normalizeBic } from "./bic";
import { shorten, toSepaCharacters } from "./charset";
import { resolveExecutionDate } from "./execution-date";
import { isIbanValid, isSepaIban, normalizeIban } from "./iban";
import { IDENTIFIER_LIMIT, NAME_LIMIT, REMITTANCE_LIMIT } from "./settings";
import type {
  AcceptedTransfer,
  RejectionReason,
  Repair,
  SepaSettings,
  TransferRequest,
} from "./types";

function amountCents(transfer: TransferRequest): number {
  return toCents(transfer.amount) ?? 0;
}

function currency(transfer: TransferRequest): string {
  return (transfer.currency ?? "EUR").toUpperCase();
}

function recipientName(transfer: TransferRequest, settings: SepaSettings): string {
  return toSepaCharacters(transfer.recipientName ?? "", settings.transliteration);
}

type Rule = (transfer: TransferRequest, settings: SepaSettings) => RejectionReason | null;

const RULES: readonly Rule[] = [
  (transfer) => (transfer.isDirectDebit ? "direct_debit" : null),
  (transfer) => (transfer.alreadyInAnotherRun ? "already_in_another_run" : null),
  (transfer) => (normalizeIban(transfer.iban) ? null : "no_bank_account"),
  (transfer) => (transfer.accountConfirmed === false ? "account_not_confirmed" : null),
  (transfer) => (isIbanValid(transfer.iban) ? null : "iban_invalid"),
  (transfer, settings) =>
    isSepaIban(transfer.iban, settings.sepaCountries) ? null : "iban_outside_sepa",
  (transfer) => (!normalizeBic(transfer.bic) || isBicValid(transfer.bic) ? null : "bic_invalid"),
  (transfer) =>
    !normalizeBic(transfer.bic) || bicMatchesIban(transfer.bic, transfer.iban)
      ? null
      : "bic_country_mismatch",
  (transfer) => (currency(transfer) === "EUR" ? null : "currency_not_euro"),
  (transfer) => (amountCents(transfer) > 0 ? null : "amount_missing"),
  (transfer, settings) =>
    amountCents(transfer) <= settings.maxAmountCents ? null : "amount_above_maximum",
  (transfer, settings) => (recipientName(transfer, settings) ? null : "recipient_name_empty"),
];

export function checkTransfer(
  transfer: TransferRequest,
  settings: SepaSettings,
): RejectionReason | null {
  for (const rule of RULES) {
    const reason = rule(transfer, settings);
    if (reason) return reason;
  }
  return null;
}

function repairText(
  raw: string,
  settings: SepaSettings,
  limit: number,
  transliterated: Repair["kind"],
  shortened: Repair["kind"],
  repairs: Repair[],
): string {
  const converted = toSepaCharacters(raw, settings.transliteration);
  if (converted !== raw.trim()) {
    repairs.push({ kind: transliterated, before: raw, after: converted });
  }
  const fitted = shorten(converted, limit);
  if (fitted !== converted) {
    repairs.push({ kind: shortened, before: converted, after: fitted });
  }
  return fitted;
}

export function prepareTransfer(
  transfer: TransferRequest,
  settings: SepaSettings,
  today: string,
  endToEndId: string,
): AcceptedTransfer {
  const repairs: Repair[] = [];

  const name = repairText(
    transfer.recipientName ?? "",
    settings,
    NAME_LIMIT,
    "name_transliterated",
    "name_shortened",
    repairs,
  );

  const rawRemittance = (transfer.remittance ?? "").trim();
  const remittance = rawRemittance
    ? repairText(
        rawRemittance,
        settings,
        REMITTANCE_LIMIT,
        "remittance_transliterated",
        "remittance_shortened",
        repairs,
      )
    : shorten(toSepaCharacters(transfer.reference, settings.transliteration), REMITTANCE_LIMIT);

  if (!rawRemittance) {
    repairs.push({
      kind: "remittance_replaced_by_reference",
      before: "",
      after: remittance,
    });
  }

  if (hasSubCentPrecision(transfer.amount)) {
    repairs.push({
      kind: "amount_rounded_to_cent",
      before: String(transfer.amount),
      after: centsToAmount(amountCents(transfer)),
    });
  }

  const execution = resolveExecutionDate(
    settings.executionDateRule,
    today,
    transfer.dueDate,
    settings.extraClosingDays,
  );
  if (execution.moved) {
    repairs.push({
      kind: "execution_date_moved",
      before: settings.executionDateRule === "on_due_date" ? (transfer.dueDate ?? today) : today,
      after: execution.date,
    });
  }

  return {
    reference: transfer.reference,
    endToEndId: shorten(endToEndId, IDENTIFIER_LIMIT),
    recipientName: name,
    iban: normalizeIban(transfer.iban),
    bic: normalizeBic(transfer.bic) || null,
    amountCents: amountCents(transfer),
    remittance,
    executionDate: execution.date,
    repairs,
  };
}
