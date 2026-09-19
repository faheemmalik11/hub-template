import { sumCents } from "./amount";
import { bicMatchesIban, isBicValid, normalizeBic } from "./bic";
import { shorten, toSepaCharacters } from "./charset";
import { checkTransfer, prepareTransfer } from "./check-transfer";
import { isIbanValid } from "./iban";
import { IDENTIFIER_LIMIT, isSupportedVersion, resolveSettings } from "./settings";
import type {
  AcceptedTransfer,
  Blocker,
  BuildOptions,
  Payer,
  PreparedRun,
  Rejection,
  SepaSettings,
  TransferRequest,
} from "./types";

function checkPayer(payer: Payer, settings: SepaSettings): Blocker | null {
  if (!toSepaCharacters(payer.name ?? "", settings.transliteration)) {
    return { reason: "payer_name_empty" };
  }
  if (!isIbanValid(payer.iban)) return { reason: "payer_iban_invalid" };
  if (normalizeBic(payer.bic)) {
    if (!isBicValid(payer.bic)) return { reason: "payer_bic_invalid" };
    if (!bicMatchesIban(payer.bic, payer.iban)) return { reason: "payer_bic_country_mismatch" };
  }
  return null;
}

function uniqueIdentifier(base: string, taken: Set<string>): string {
  const start = shorten(base, IDENTIFIER_LIMIT);
  if (!taken.has(start)) {
    taken.add(start);
    return start;
  }
  for (let attempt = 2; ; attempt += 1) {
    const suffix = `-${attempt}`;
    const candidate = shorten(start, IDENTIFIER_LIMIT - suffix.length) + suffix;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

function nameFor(transfer: TransferRequest, settings: SepaSettings): string {
  return toSepaCharacters(transfer.recipientName ?? "", settings.transliteration);
}

export function prepareRun(options: BuildOptions): PreparedRun {
  const settings = resolveSettings(options.settings);
  const accepted: AcceptedTransfer[] = [];
  const rejected: Rejection[] = [];

  const seenReferences = new Set<string>();
  const takenIdentifiers = new Set<string>();

  for (const transfer of options.transfers) {
    const recipientName = nameFor(transfer, settings) || (transfer.recipientName ?? "");

    if (seenReferences.has(transfer.reference)) {
      rejected.push({
        reference: transfer.reference,
        recipientName,
        reason: "duplicate_reference",
      });
      continue;
    }
    seenReferences.add(transfer.reference);

    const reason = checkTransfer(transfer, settings);
    if (reason) {
      rejected.push({ reference: transfer.reference, recipientName, reason });
      continue;
    }

    const endToEndId = uniqueIdentifier(
      toSepaCharacters(transfer.reference, settings.transliteration),
      takenIdentifiers,
    );
    accepted.push(prepareTransfer(transfer, settings, options.today, endToEndId));
  }

  const blocker =
    (!isSupportedVersion(settings.version) ? { reason: "version_unsupported" as const } : null) ??
    checkPayer(options.payer, settings) ??
    (accepted.length === 0 ? { reason: "nothing_to_transfer" as const } : null);

  return {
    accepted,
    rejected,
    blocker,
    totalCents: sumCents(accepted.map((one) => one.amountCents)),
  };
}
