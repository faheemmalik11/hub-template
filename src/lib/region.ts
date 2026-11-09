export function parseExtraAllowedCountries(value: string | undefined | null): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code)),
  );
}

export type RegionVerdict = {
  allowed: boolean;
  country: string | null;
  exceptionUntil: string | null;
};

export function decideRegion(
  country: string | null | undefined,
  exceptionUntil: string | null | undefined,
  allowedCountries: Set<string>,
  now: Date = new Date(),
  extraAllowedCountries: Set<string> = new Set(),
): RegionVerdict {
  const code = country ? country.toUpperCase() : null;

  if (allowedCountries.size === 0) return { allowed: true, country: code, exceptionUntil: null };
  if (!code || code === "XX") return { allowed: true, country: null, exceptionUntil: null };
  if (allowedCountries.has(code) || extraAllowedCountries.has(code)) {
    return { allowed: true, country: code, exceptionUntil: null };
  }

  const exceptionDate = exceptionUntil ? new Date(exceptionUntil) : null;
  const exceptionIsValid =
    !!exceptionDate && !Number.isNaN(exceptionDate.getTime()) && exceptionDate.getTime() > now.getTime();

  return {
    allowed: exceptionIsValid,
    country: code,
    exceptionUntil: exceptionIsValid ? (exceptionUntil as string) : null,
  };
}

export function countryFromRequestHeaders(headers: Headers): string | null {
  return (
    headers.get("x-vercel-ip-country") ??
    headers.get("cf-ipcountry") ??
    headers.get("x-country-code") ??
    null
  );
}
