import { Document } from "sepa";

import { centsToNumber, sumCents } from "./amount";
import { shorten, toSepaCharacters } from "./charset";
import { IDENTIFIER_LIMIT, NAME_LIMIT } from "./settings";
import { normalizeBic } from "./bic";
import { normalizeIban } from "./iban";
import type { AcceptedTransfer, PaymentFile, Payer, SepaSettings } from "./types";

const FILE_SUFFIX_ROOM = 3;
const BLOCK_AND_TRANSACTION_ROOM = 7;
const MESSAGE_ID_BASE_LIMIT = IDENTIFIER_LIMIT - BLOCK_AND_TRANSACTION_ROOM - FILE_SUFFIX_ROOM;

export type FileNamePattern = (messageId: string, index: number, total: number) => string;

export interface BuildFilesOptions {
  payer: Payer;
  messageId: string;
  today: string;
  settings: SepaSettings;
  fileName?: FileNamePattern;
}

const defaultFileName: FileNamePattern = (messageId) => `${messageId}.xml`;

function chunk(transfers: readonly AcceptedTransfer[], size: number | null): AcceptedTransfer[][] {
  if (!size || size <= 0 || transfers.length <= size) return [[...transfers]];
  const chunks: AcceptedTransfer[][] = [];
  for (let start = 0; start < transfers.length; start += size) {
    chunks.push(transfers.slice(start, start + size));
  }
  return chunks;
}

function groupByExecutionDate(
  transfers: readonly AcceptedTransfer[],
): Map<string, AcceptedTransfer[]> {
  const groups = new Map<string, AcceptedTransfer[]>();
  for (const transfer of transfers) {
    const group = groups.get(transfer.executionDate);
    if (group) group.push(transfer);
    else groups.set(transfer.executionDate, [transfer]);
  }
  return groups;
}

function atLocalNoon(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function messageIdFor(messageId: string, index: number, total: number): string {
  const base = shorten(toSepaCharacters(messageId), MESSAGE_ID_BASE_LIMIT);
  return total === 1 ? base : `${base}-${index + 1}`;
}

export function buildPaymentFiles(
  accepted: readonly AcceptedTransfer[],
  options: BuildFilesOptions,
): PaymentFile[] {
  const { payer, settings } = options;
  const debtorName = shorten(toSepaCharacters(payer.name, settings.transliteration), NAME_LIMIT);
  const chunks = chunk(accepted, settings.maxTransfersPerFile);
  const nameFor = options.fileName ?? defaultFileName;

  return chunks.map((transfers, index) => {
    const messageId = messageIdFor(options.messageId, index, chunks.length);
    const document = new Document(settings.version);

    document.grpHdr.id = messageId;
    document.grpHdr.created = atLocalNoon(options.today);
    document.grpHdr.initiatorName = debtorName;
    document.grpHdr.batchBooking = settings.batchBooking;

    for (const [executionDate, group] of groupByExecutionDate(transfers)) {
      const paymentInfo = document.createPaymentInfo();
      paymentInfo.requestedExecutionDate = atLocalNoon(executionDate);
      paymentInfo.batchBooking = settings.batchBooking;
      paymentInfo.debtorName = debtorName;
      paymentInfo.debtorIBAN = normalizeIban(payer.iban);
      paymentInfo.debtorBIC = normalizeBic(payer.bic);
      document.addPaymentInfo(paymentInfo);

      for (const transfer of group) {
        const transaction = paymentInfo.createTransaction();
        transaction.end2endId = transfer.endToEndId;
        transaction.creditorName = transfer.recipientName;
        transaction.creditorIBAN = transfer.iban;
        transaction.creditorBIC = transfer.bic ?? "";
        transaction.amount = centsToNumber(transfer.amountCents);
        transaction.currency = "EUR";
        transaction.remittanceInfo = transfer.remittance;
        paymentInfo.addTransaction(transaction);
      }
    }

    return {
      fileName: nameFor(messageId, index, chunks.length),
      messageId,
      content: document.toString(),
      transferCount: transfers.length,
      totalCents: sumCents(transfers.map((one) => one.amountCents)),
    };
  });
}
