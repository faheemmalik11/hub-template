import { serviceClient } from "./supabase.ts";
import { TABLE } from "./tables.ts";
import { banksapiAdapter } from "./adapters/banksapi/adapter.ts";
import { pleoCardAdapter } from "./adapters/pleo/adapter.ts";
import type { IBankingAdapter, ICardAdapter } from "./banking-adapter.ts";

export interface LocaleSettings {
  dateFormat: "dd.MM.yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
  decimalSeparator: "," | ".";
  currency: string;
}

export interface TaxDefaults {
  country: string;
  defaultVatRate: number;
}

export interface InvoiceWording {
  invoiceKindLabels: Record<string, string>;
  invoiceFallbackLabel: string;
  invoiceUnitName: string;
  defaultPaymentMethod: string;
  documentFallbackLabel: string;
}

interface InvoiceSettingsRow {
  default_vat_rate: number | string;
  country_code: string;
  invoice_fallback_label: string;
  invoice_unit_name: string;
  default_payment_method: string;
  document_fallback_label: string;
}

const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  dateFormat: "dd.MM.yyyy",
  decimalSeparator: ",",
  currency: "EUR",
};

const DEFAULT_INVOICE_SETTINGS: InvoiceSettingsRow = {
  default_vat_rate: 19,
  country_code: "DE",
  invoice_fallback_label: "Rechnung",
  invoice_unit_name: "Pauschal",
  default_payment_method: "Überweisung",
  document_fallback_label: "Beleg",
};

const DEFAULT_KIND_LABELS: Record<string, string> = {
  commission: "Provision",
  coaching: "Coaching",
};

const CACHE_MS = 60_000;

let pipelineCache: { at: number; config: Record<string, unknown> } | null = null;
let invoiceCache:
  | { at: number; settings: InvoiceSettingsRow; kindLabels: Record<string, string> }
  | null = null;

async function pipelineConfig(): Promise<Record<string, unknown>> {
  if (pipelineCache && Date.now() - pipelineCache.at < CACHE_MS) return pipelineCache.config;

  const db = serviceClient();
  const { data, error } = await db
    .from(TABLE.tenantSettings)
    .select("config")
    .eq("single_row", true)
    .maybeSingle();
  if (error) throw error;

  const config = (data?.config as Record<string, unknown>) ?? {};
  pipelineCache = { at: Date.now(), config };
  return config;
}

async function invoiceSettings(): Promise<{
  settings: InvoiceSettingsRow;
  kindLabels: Record<string, string>;
}> {
  if (invoiceCache && Date.now() - invoiceCache.at < CACHE_MS) return invoiceCache;

  const db = serviceClient();
  const { data, error } = await db
    .from(TABLE.invoiceSettings)
    .select(
      "default_vat_rate, country_code, invoice_fallback_label, invoice_unit_name, default_payment_method, document_fallback_label",
    )
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;

  const { data: labelRows, error: labelError } = await db
    .from(TABLE.invoiceKindLabels)
    .select("kind, label");
  if (labelError) throw labelError;

  const settings = { ...DEFAULT_INVOICE_SETTINGS, ...(data as InvoiceSettingsRow | null) };
  const kindLabels = { ...DEFAULT_KIND_LABELS };
  for (const row of (labelRows ?? []) as { kind: string; label: string }[]) {
    kindLabels[row.kind] = row.label;
  }

  invoiceCache = { at: Date.now(), settings, kindLabels };
  return invoiceCache;
}

export async function tenantLocaleSettings(): Promise<LocaleSettings> {
  const config = await pipelineConfig();
  return { ...DEFAULT_LOCALE_SETTINGS, ...(config.locale as Partial<LocaleSettings>) };
}

export async function taxDefaults(): Promise<TaxDefaults> {
  const { settings } = await invoiceSettings();
  return {
    country: settings.country_code,
    defaultVatRate: Number(settings.default_vat_rate),
  };
}

export async function invoiceWording(): Promise<InvoiceWording> {
  const { settings, kindLabels } = await invoiceSettings();
  return {
    invoiceKindLabels: kindLabels,
    invoiceFallbackLabel: settings.invoice_fallback_label,
    invoiceUnitName: settings.invoice_unit_name,
    defaultPaymentMethod: settings.default_payment_method,
    documentFallbackLabel: settings.document_fallback_label,
  };
}

export async function resolveBankingAdapter(): Promise<IBankingAdapter> {
  const config = await pipelineConfig();
  const banking = config.banking as { provider?: string } | undefined;
  const provider = banking?.provider ?? "banksapi";
  if (provider === "banksapi") return banksapiAdapter();
  throw new Error(`no banking adapter registered for provider "${provider}"`);
}

export async function resolveCardAdapter(): Promise<ICardAdapter> {
  const config = await pipelineConfig();
  const cards = config.cards as { provider?: string } | undefined;
  const provider = cards?.provider ?? "pleo";
  if (provider === "pleo") return pleoCardAdapter();
  throw new Error(`no card adapter registered for provider "${provider}"`);
}
