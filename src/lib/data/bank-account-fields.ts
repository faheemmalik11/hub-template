import { compactIBAN, isBIC, isCurrencyCode, isPayableIBAN } from "./format";

export interface BankAccountFields {
  accountName: string;
  companyId: string | null;
  iban: string | null;
  bic: string | null;
  holder: string | null;
  bankName: string | null;
  productType: string | null;
  currency: string | null;
}

export type BankAccountField = keyof BankAccountFields;

export interface BankAccountRules {
  requireCompany?: boolean;
  requireIban?: boolean;
  requireHolder?: boolean;
  requireProductType?: boolean;
  requireCurrency?: boolean;
}

export const BANK_ACCOUNT_DIALOG_RULES: BankAccountRules = {
  requireCompany: true,
  requireIban: true,
  requireHolder: true,
  requireProductType: true,
  requireCurrency: true,
};

export const BANK_ACCOUNT_CARD_RULES: BankAccountRules = {
  requireCompany: true,
};

export const BANK_ACCOUNT_IMPORT_RULES: BankAccountRules = {
  requireCompany: true,
  requireIban: true,
};

export const BANK_ACCOUNT_PRODUCT_TYPES = [
  "GIROKONTO",
  "FESTGELDKONTO",
  "KREDITKONTO",
  "MASTERCARD",
  "VISA",
] as const;

export function isCardType(productType: string | null | undefined): boolean {
  return /card|karte/i.test(productType ?? "");
}

export const BANK_ACCOUNT_LIMITS = {
  accountName: 120,
  holder: 140,
  bankName: 140,
  productType: 60,
} as const;

export type BankAccountErrorCode =
  | "nameMissing"
  | "nameTooLong"
  | "companyMissing"
  | "ibanMissing"
  | "ibanInvalid"
  | "bicInvalid"
  | "holderMissing"
  | "productTypeMissing"
  | "currencyMissing"
  | "currencyInvalid"
  | "holderTooLong"
  | "bankNameTooLong"
  | "productTypeTooLong";

export type BankAccountErrors = Partial<Record<BankAccountField, BankAccountErrorCode>>;

export function emptyBankAccountFields(): BankAccountFields {
  return {
    accountName: "",
    companyId: null,
    iban: null,
    bic: null,
    holder: null,
    bankName: null,
    productType: null,
    currency: null,
  };
}

export function validateBankAccountFields(
  values: BankAccountFields,
  rules: BankAccountRules = {},
): BankAccountErrors {
  const errors: BankAccountErrors = {};
  const text = (v: string | null | undefined) => (v ?? "").trim();

  const name = text(values.accountName);
  if (!name) errors.accountName = "nameMissing";
  else if (name.length > BANK_ACCOUNT_LIMITS.accountName) errors.accountName = "nameTooLong";

  if (rules.requireCompany && !values.companyId) errors.companyId = "companyMissing";

  const productType = text(values.productType);
  if (!productType) {
    if (rules.requireProductType) errors.productType = "productTypeMissing";
  } else if (productType.length > BANK_ACCOUNT_LIMITS.productType) {
    errors.productType = "productTypeTooLong";
  }

  const iban = text(values.iban);
  if (!iban) {
    if (rules.requireIban && !isCardType(productType)) errors.iban = "ibanMissing";
  } else if (!isPayableIBAN(iban)) {
    errors.iban = "ibanInvalid";
  }

  const bic = text(values.bic);
  if (bic && !isBIC(bic)) errors.bic = "bicInvalid";

  const currency = text(values.currency);
  if (!currency) {
    if (rules.requireCurrency) errors.currency = "currencyMissing";
  } else if (!isCurrencyCode(currency)) {
    errors.currency = "currencyInvalid";
  }

  const holder = text(values.holder);
  if (!holder) {
    if (rules.requireHolder) errors.holder = "holderMissing";
  } else if (holder.length > BANK_ACCOUNT_LIMITS.holder) {
    errors.holder = "holderTooLong";
  }

  if (text(values.bankName).length > BANK_ACCOUNT_LIMITS.bankName) {
    errors.bankName = "bankNameTooLong";
  }

  return errors;
}

export function normalizeBankAccountFields(values: BankAccountFields): BankAccountFields {
  const text = (v: string | null | undefined) => (v ?? "").trim() || null;
  return {
    accountName: values.accountName.trim(),
    companyId: values.companyId,
    iban: values.iban?.trim() ? compactIBAN(values.iban) : null,
    bic: values.bic?.trim() ? values.bic.replace(/\s+/g, "").toUpperCase() : null,
    holder: text(values.holder),
    bankName: text(values.bankName),
    productType: text(values.productType),
    currency: values.currency?.trim() ? values.currency.trim().toUpperCase() : null,
  };
}
