import process from "node:process";

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { TABLE } from "@/config/tables";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  countryFromRequestHeaders,
  decideRegion,
  parseExtraAllowedCountries,
  type RegionVerdict,
} from "@/lib/region";

type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function tenantSecurityConfig(db: Db): Promise<Record<string, unknown>> {
  const { data } = await db
    .from(TABLE.tenantSettings)
    .select("config")
    .eq("single_row", true)
    .maybeSingle();
  const config = (data as { config?: Record<string, unknown> } | null)?.config ?? {};
  return (config.security as Record<string, unknown> | undefined) ?? {};
}

export const checkMfaRequirement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<boolean> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const security = await tenantSecurityConfig(supabaseAdmin as Db);
    return security.mfaEnabled === true;
  });

async function allowedCountriesForTenant(db: Db): Promise<Set<string>> {
  const security = await tenantSecurityConfig(db);
  const list = Array.isArray(security.allowedCountries)
    ? (security.allowedCountries as string[])
    : [];
  return new Set(list.map((code) => String(code).toUpperCase()));
}

function regionRuleDisabledForLocalTunnelTesting(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.REGION_RULE_DISABLED === "1";
}

export const checkRegion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RegionVerdict> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;
    const allowedCountries = await allowedCountriesForTenant(db);

    if (allowedCountries.size === 0) return { allowed: true, country: null, exceptionUntil: null };
    if (regionRuleDisabledForLocalTunnelTesting()) {
      return { allowed: true, country: null, exceptionUntil: null };
    }

    const request = getRequest();
    const country = request?.headers ? countryFromRequestHeaders(request.headers) : null;
    const extraAllowedCountries = parseExtraAllowedCountries(process.env.REGION_ALLOWED_EXTRA);

    const quickVerdict = decideRegion(
      country,
      null,
      allowedCountries,
      new Date(),
      extraAllowedCountries,
    );
    if (quickVerdict.allowed) return quickVerdict;

    const email = (context as { claims?: { email?: string } }).claims?.email ?? null;
    if (!email)
      return decideRegion(country, null, allowedCountries, new Date(), extraAllowedCountries);

    const { data } = await db
      .from(TABLE.appUsers)
      .select("region_exception_until")
      .ilike("email", email)
      .maybeSingle();

    return decideRegion(
      country,
      (data as { region_exception_until: string | null } | null)?.region_exception_until ?? null,
      allowedCountries,
    );
  });
