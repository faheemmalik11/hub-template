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

export interface TaxRegime {
  country: string;
  defaultVatRate: number;
  taxModel: "flat" | "composite";
}

const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  dateFormat: "dd.MM.yyyy",
  decimalSeparator: ",",
  currency: "EUR",
};

const DEFAULT_TAX_REGIME: TaxRegime = {
  country: "DE",
  defaultVatRate: 19,
  taxModel: "flat",
};

let cache: { at: number; config: Record<string, unknown> } | null = null;
const CACHE_MS = 60_000;

async function tenantConfig(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.config;

  const db = serviceClient();
  const { data, error } = await db
    .from(TABLE.tenantSettings)
    .select("config")
    .eq("single_row", true)
    .maybeSingle();
  if (error) throw error;

  const config = (data?.config as Record<string, unknown>) ?? {};
  cache = { at: Date.now(), config };
  return config;
}

export async function tenantLocaleSettings(): Promise<LocaleSettings> {
  const config = await tenantConfig();
  return { ...DEFAULT_LOCALE_SETTINGS, ...(config.locale as Partial<LocaleSettings>) };
}

export async function tenantTaxRegime(): Promise<TaxRegime> {
  const config = await tenantConfig();
  return { ...DEFAULT_TAX_REGIME, ...(config.tax as Partial<TaxRegime>) };
}

export async function resolveBankingAdapter(): Promise<IBankingAdapter> {
  const config = await tenantConfig();
  const banking = config.banking as { provider?: string } | undefined;
  const provider = banking?.provider ?? "banksapi";
  if (provider === "banksapi") return banksapiAdapter();
  throw new Error(`no banking adapter registered for provider "${provider}"`);
}

export async function resolveCardAdapter(): Promise<ICardAdapter> {
  const config = await tenantConfig();
  const cards = config.cards as { provider?: string } | undefined;
  const provider = cards?.provider ?? "pleo";
  if (provider === "pleo") return pleoCardAdapter();
  throw new Error(`no card adapter registered for provider "${provider}"`);
}
