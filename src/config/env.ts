import { z } from "zod";

/**
 * The bootstrap, and only this.
 *
 * Two values: which database this Hub belongs to, and the public key to reach it with. They cannot
 * come from the database, because they are how the database is found. Everything else a client
 * configures is a row, read at run time. See planning/08-startup.md.
 *
 * The schema below is the single source of truth: it validates at startup and it generates
 * `.env.example`, so the two can never drift. Run `node scripts/write-env-example.mjs` after
 * changing it.
 */
export const envSchema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .min(1, "the client's Supabase project URL")
    .transform((value) => (/^https?:\/\//.test(value) ? value : `https://${value}`)),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "the project's publishable (anon) key"),
});

export const ENV_DESCRIPTIONS: Record<keyof z.infer<typeof envSchema>, string> = {
  VITE_SUPABASE_URL:
    "The client's Supabase project URL. `supabase start` prints it for local work.",
  VITE_SUPABASE_PUBLISHABLE_KEY:
    "That project's publishable (anon) key. Never the service-role key: this one reaches the browser.",
};

function readEnv() {
  const parsed = envSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(
      `The environment is not set up:\n  ${missing.join("\n  ")}\n` +
        "Copy .env.example to .env and fill it in.",
    );
  }
  return parsed.data;
}

const parsed = readEnv();

export const ENV = {
  supabaseUrl: parsed.VITE_SUPABASE_URL,
  supabasePublishableKey: parsed.VITE_SUPABASE_PUBLISHABLE_KEY,
} as const;
