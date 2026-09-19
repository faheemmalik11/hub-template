/**
 * The bootstrap, and only this.
 *
 * Two values: which database this Hub belongs to, and the public key to reach it with. They cannot
 * come from the database, because they are how the database is found. Everything else a client
 * configures is a row, read at run time. See planning/08-startup.md.
 *
 * Read once, here, so a missing value fails at start with a sentence rather than as `undefined`
 * three layers down.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill in the client's Supabase project.`,
    );
  }
  return value;
}

/** Always https, so a host pasted without a scheme still works. */
function asUrl(value: string): string {
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

export const ENV = {
  supabaseUrl: asUrl(required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL)),
  supabasePublishableKey: required(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
