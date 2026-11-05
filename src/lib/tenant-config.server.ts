import { TABLE } from "@/config/tables";
import { DEFAULT_LOCALE_SETTINGS, type LocaleSettings } from "@/lib/locale/locale-parser";

export interface TaxRegime {
  country: string;
  defaultVatRate: number;
  taxModel: "flat" | "composite";
}

const DEFAULT_TAX_REGIME: TaxRegime = {
  country: "DE",
  defaultVatRate: 19,
  taxModel: "flat",
};

type Db = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: boolean) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

type CachedConfig = { at: number; config: Record<string, unknown> };
let cache: CachedConfig | null = null;
const CACHE_MS = 60_000;

async function tenantConfig(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.config;

  const result = (await (
    await db()
  )
    .from(TABLE.tenantSettings)
    .select("config")
    .eq("single_row", true)) as {
    data: Array<{ config: Record<string, unknown> }> | null;
    error: unknown;
  };
  if (result.error) throw result.error;

  const config = result.data?.[0]?.config ?? {};
  cache = { at: Date.now(), config };
  return config;
}

export async function tenantLocaleSettings(): Promise<LocaleSettings> {
  const config = await tenantConfig();
  const locale = config.locale as Partial<LocaleSettings> | undefined;
  return { ...DEFAULT_LOCALE_SETTINGS, ...locale };
}

export async function tenantTaxRegime(): Promise<TaxRegime> {
  const config = await tenantConfig();
  const tax = config.tax as Partial<TaxRegime> | undefined;
  return { ...DEFAULT_TAX_REGIME, ...tax };
}
