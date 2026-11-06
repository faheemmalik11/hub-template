import { isIbanValid, normalizeIban } from "./sepa/iban";
import { compareCompanyNameSpelling } from "./company-name-match";
import { foldAddressText } from "./property-address-match";

export type CheckStatus = "ok" | "warn" | "fail" | "unknown";
export type CheckSureness = "high" | "medium" | "low";

export type ReceiptCheckKey =
  "recipientAddress" | "companySpelling" | "serviceFitsCompany" | "iban";

export interface ReceiptCheckResult {
  key: ReceiptCheckKey;
  status: CheckStatus;
  sureness: CheckSureness;
  reason: string;
  params: Record<string, string>;
}

export interface CompanyForReceiptChecks {
  code: string;
  name: string;
  address: string | null;
}

export type IbanProblem = "empty" | "shape" | "length" | "checksum";

const IBAN_LENGTH_BY_COUNTRY: Readonly<Record<string, number>> = {
  AT: 20,
  BE: 16,
  CH: 21,
  CZ: 24,
  DE: 22,
  DK: 18,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  IE: 22,
  IT: 27,
  LI: 21,
  LU: 20,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  SE: 24,
};

const IBAN_SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

export function ibanProblem(iban: string | null | undefined): IbanProblem | null {
  const compact = normalizeIban((iban ?? "").replace(/[.-]/g, ""));
  if (compact === "") return "empty";
  if (!IBAN_SHAPE.test(compact)) return "shape";
  const expectedLength = IBAN_LENGTH_BY_COUNTRY[compact.slice(0, 2)];
  if (expectedLength !== undefined && compact.length !== expectedLength) return "length";
  if (!isIbanValid(compact)) return "checksum";
  return null;
}

function tokensOf(address: string | null | undefined): string[] {
  return foldAddressText(address)
    .split(" ")
    .filter((token) => token.length >= 2 || /^\d+$/.test(token));
}

function postcodeOf(address: string | null | undefined): string | null {
  return (address ?? "").match(/\b\d{5}\b/)?.[0] ?? null;
}

export function checkRecipientAddress(
  recipientAddress: string | null | undefined,
  company: CompanyForReceiptChecks | null,
): ReceiptCheckResult {
  const key = "recipientAddress";
  if (!company) return { key, status: "unknown", sureness: "low", reason: "noCompany", params: {} };
  if (!company.address?.trim()) {
    return {
      key,
      status: "unknown",
      sureness: "low",
      reason: "noCompanyAddress",
      params: { company: company.name },
    };
  }
  if (!recipientAddress?.trim()) {
    return { key, status: "unknown", sureness: "low", reason: "noRecipientAddress", params: {} };
  }
  const wanted = tokensOf(company.address);
  const found = new Set(tokensOf(recipientAddress));
  const covered = wanted.filter((token) => found.has(token)).length;
  const share = wanted.length === 0 ? 0 : covered / wanted.length;
  const wantedPostcode = postcodeOf(company.address);
  const foundPostcode = postcodeOf(recipientAddress);
  const postcodeKnownOnBoth = wantedPostcode !== null && foundPostcode !== null;
  const params = { company: company.name };
  if (share >= 0.8) {
    return {
      key,
      status: "ok",
      sureness: postcodeKnownOnBoth && wantedPostcode === foundPostcode ? "high" : "medium",
      reason: "match",
      params,
    };
  }
  if (share >= 0.5) {
    return { key, status: "warn", sureness: "medium", reason: "partial", params };
  }
  return {
    key,
    status: "fail",
    sureness: postcodeKnownOnBoth && wantedPostcode !== foundPostcode ? "high" : "medium",
    reason: "mismatch",
    params,
  };
}

export function checkCompanySpelling(
  recipientName: string | null | undefined,
  company: CompanyForReceiptChecks | null,
): ReceiptCheckResult {
  const key = "companySpelling";
  if (!company) return { key, status: "unknown", sureness: "low", reason: "noCompany", params: {} };
  const params = { onDocument: recipientName?.trim() ?? "", company: company.name };
  const verdict = compareCompanyNameSpelling(recipientName, company.name);
  switch (verdict) {
    case "same":
      return { key, status: "ok", sureness: "high", reason: "same", params };
    case "other_spelling":
      return { key, status: "warn", sureness: "high", reason: "otherSpelling", params };
    case "close":
      return { key, status: "warn", sureness: "medium", reason: "close", params };
    case "different":
      return { key, status: "fail", sureness: "medium", reason: "different", params };
    default:
      return { key, status: "unknown", sureness: "low", reason: "noRecipientName", params: {} };
  }
}

export function checkServiceFitsCompany(args: {
  companyCode: string | null;
  propertyCode: string | null;
  companyCodesOfProperty: string[];
}): ReceiptCheckResult {
  const key = "serviceFitsCompany";
  if (!args.companyCode) {
    return { key, status: "unknown", sureness: "low", reason: "noCompany", params: {} };
  }
  if (!args.propertyCode) {
    return { key, status: "unknown", sureness: "low", reason: "noProperty", params: {} };
  }
  if (args.companyCodesOfProperty.length === 0) {
    return {
      key,
      status: "unknown",
      sureness: "low",
      reason: "propertyNotLinked",
      params: { property: args.propertyCode },
    };
  }
  const params = {
    property: args.propertyCode,
    company: args.companyCode,
    owners: args.companyCodesOfProperty.join(", "),
  };
  if (args.companyCodesOfProperty.includes(args.companyCode)) {
    return { key, status: "ok", sureness: "medium", reason: "propertyBelongsToCompany", params };
  }
  return { key, status: "warn", sureness: "medium", reason: "propertyBelongsToOther", params };
}

export interface ReceiptAccountForChecks {
  iban: string;
  origin: "invoice" | "default";
}

export function checkIban(args: {
  accounts: ReceiptAccountForChecks[];
  supplierKnownFlag: boolean | null | undefined;
  hasSupplier: boolean;
}): ReceiptCheckResult {
  const key = "iban";
  if (args.accounts.length === 0) {
    return { key, status: "unknown", sureness: "low", reason: "noAccount", params: {} };
  }
  const withProblem = args.accounts.find((account) => ibanProblem(account.iban) !== null);
  if (withProblem) {
    return {
      key,
      status: "fail",
      sureness: "high",
      reason: "invalid",
      params: { problem: ibanProblem(withProblem.iban) ?? "" },
    };
  }
  if (args.supplierKnownFlag === false) {
    return { key, status: "fail", sureness: "high", reason: "notOnFile", params: {} };
  }
  if (args.supplierKnownFlag === true) {
    return { key, status: "ok", sureness: "high", reason: "onFile", params: {} };
  }
  if (args.accounts.every((account) => account.origin === "default")) {
    return { key, status: "warn", sureness: "medium", reason: "fromSupplierDefault", params: {} };
  }
  return { key, status: "ok", sureness: "medium", reason: "validNotCompared", params: {} };
}

export function allReceiptChecks(args: {
  recipientName: string | null | undefined;
  recipientAddress: string | null | undefined;
  company: CompanyForReceiptChecks | null;
  propertyCode: string | null;
  companyCodesOfProperty: string[];
  accounts: ReceiptAccountForChecks[];
  supplierKnownFlag: boolean | null | undefined;
  hasSupplier: boolean;
}): ReceiptCheckResult[] {
  return [
    checkRecipientAddress(args.recipientAddress, args.company),
    checkCompanySpelling(args.recipientName, args.company),
    checkServiceFitsCompany({
      companyCode: args.company?.code ?? null,
      propertyCode: args.propertyCode,
      companyCodesOfProperty: args.companyCodesOfProperty,
    }),
    checkIban({
      accounts: args.accounts,
      supplierKnownFlag: args.supplierKnownFlag,
      hasSupplier: args.hasSupplier,
    }),
  ];
}
