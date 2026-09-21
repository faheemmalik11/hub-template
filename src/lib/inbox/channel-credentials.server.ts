// Every provider key the Hub uses, read from the store the admin panel writes. Never from .env.
//
// WHY. The panel saves each source's secrets in `public.credentials`, one encrypted row per name,
// and the pipeline reads them from there. The Hub used to keep its own copy in .env, so rotating a
// secret in the panel left the Hub on a stale one until somebody remembered to update its
// environment too. Two stores for one fact, the same problem as mail_settings and channels. So the
// database is the only place a key is read from, and a key that is missing there is an error that
// says so, rather than a quiet fallback to a copy nobody maintains.
//
// WHAT IS STORED. A source's keys sit under its channel key (microsoft_365, dropbox). Keys that
// belong to the tenant as a whole, OPENAI_API_KEY today, sit under the empty channel key ''.
// A source is found by `kind`, never by key: keys belong to the panel.
//
// SERVER ONLY, AND IT MUST STAY THAT WAY. This reads through the service role, because
// `public.credentials` has no RLS policy and must not get one, and it decrypts with the two secrets
// that have to stay in the environment: TENANT_SECRET_KEY, this client's own key, which opens every
// value the panel has sealed since per-client keys ("v2."), and SECRET_ENCRYPTION_KEY, the panel's
// master key, for the older Fernet values not re-saved since. Neither may reach the browser.
import type { ChannelKind } from "@/lib/data/types";
import { TABLE } from "@/config/tables";
import { fernetDecrypt, looksEncrypted } from "./fernet.server";
import { looksSealed, openSealed } from "./sealed.server";

export const SECRET_KEY_ENV = "SECRET_ENCRYPTION_KEY";
export const TENANT_KEY_ENV = "TENANT_SECRET_KEY";

/** The channel key the panel stores tenant-wide credentials under. */
const TENANT = "";

type Stored = { values: Record<string, string>; undecryptable: string[]; sealed: string[] };

/** Cached per process: these change when somebody edits the panel, not between requests. */
const cache = new Map<string, { at: number; stored: Stored }>();
const CACHE_MS = 60_000;

type Db = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

async function channelKeyOf(kind: ChannelKind): Promise<string | null> {
  const got = (await (
    await db()
  )
    .from(TABLE.channels)
    .select("key, position")
    .eq("kind", kind)) as {
    data: Array<{ key: string; position: number }> | null;
    error: unknown;
  };
  if (got.error) throw got.error;
  return [...(got.data ?? [])].sort((a, b) => a.position - b.position)[0]?.key ?? null;
}

async function readStored(channelKey: string): Promise<Stored> {
  const hit = cache.get(channelKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.stored;

  const rows = (await (
    await db()
  )
    .from(TABLE.credentials)
    .select("name, value")
    .eq("channel_key", channelKey)) as {
    data: Array<{ name: string; value: string | null }> | null;
    error: unknown;
  };
  if (rows.error) throw rows.error;

  const secret = process.env[SECRET_KEY_ENV];
  const tenantKey = process.env[TENANT_KEY_ENV];
  const stored: Stored = { values: {}, undecryptable: [], sealed: [] };
  for (const row of rows.data ?? []) {
    if (!row.value) continue;
    if (looksSealed(row.value)) {
      stored.sealed.push(row.name);
      try {
        if (!tenantKey) throw new Error("no key");
        stored.values[row.name] = await openSealed(row.value, tenantKey, channelKey, row.name);
      } catch {
        stored.undecryptable.push(row.name);
      }
      continue;
    }
    if (!looksEncrypted(row.value)) {
      stored.values[row.name] = row.value;
      continue;
    }
    try {
      if (!secret) throw new Error("no key");
      stored.values[row.name] = await fernetDecrypt(row.value, secret);
    } catch {
      // A missing or wrong key, or an altered value. Recorded by name only, so the error below can
      // say which credential could not be read without saying anything about its contents.
      stored.undecryptable.push(row.name);
    }
  }
  cache.set(channelKey, { at: Date.now(), stored });
  return stored;
}

function missing(name: string, where: string, stored: Stored): Error {
  if (stored.undecryptable.includes(name)) {
    if (stored.sealed.includes(name)) {
      return new Error(
        process.env[TENANT_KEY_ENV]
          ? `${name} ist gespeichert, lässt sich aber nicht entschlüsseln. ${TENANT_KEY_ENV} dieser ` +
              "App muss der Schlüssel dieses Mandanten aus dem Admin-Bereich sein."
          : `${TENANT_KEY_ENV} ist nicht gesetzt, daher lässt sich ${name} nicht entschlüsseln.`,
      );
    }
    return new Error(
      process.env[SECRET_KEY_ENV]
        ? `${name} ist gespeichert, lässt sich aber nicht entschlüsseln. ${SECRET_KEY_ENV} dieser App ` +
            "muss derselbe Schlüssel sein, den der Admin-Bereich verwendet."
        : `${SECRET_KEY_ENV} ist nicht gesetzt, daher lässt sich ${name} nicht entschlüsseln.`,
    );
  }
  return new Error(`${name} ist ${where} nicht hinterlegt. Im Admin-Bereich eintragen.`);
}

/** One credential of the source of this kind. Throws, in German, when it is not stored. */
export async function channelCredential(kind: ChannelKind, name: string): Promise<string> {
  const key = await channelKeyOf(kind);
  if (!key) {
    throw new Error("Diese Quelle ist im Admin-Bereich noch nicht eingerichtet.");
  }
  const stored = await readStored(key);
  const value = stored.values[name];
  if (value) return value;
  throw missing(name, "für diese Quelle", stored);
}

/** One tenant-wide credential, such as OPENAI_API_KEY. Throws, in German, when it is not stored. */
export async function tenantCredential(name: string): Promise<string> {
  const stored = await readStored(TENANT);
  const value = stored.values[name];
  if (value) return value;
  throw missing(name, "für diesen Mandanten", stored);
}

/** The same, but null instead of an error, for callers that carry on without it. */
export async function tenantCredentialOrNull(name: string): Promise<string | null> {
  try {
    return await tenantCredential(name);
  } catch {
    return null;
  }
}

/**
 * The mailbox address the pipeline reads, from the mailbox source's own settings.
 *
 * `channels.settings->>'mailbox'` is what the ingestion run uses, so the folder picker showing a
 * different mailbox than the one being ingested is exactly the confusion to avoid. provider_ref is
 * read too, because that is where the address lived before it moved into settings.
 */
export async function channelMailbox(): Promise<string> {
  const got = (await (
    await db()
  )
    .from(TABLE.channels)
    .select("settings, provider_ref, position")
    .eq("kind", "mailbox")) as {
    data: Array<{
      settings: Record<string, unknown> | null;
      provider_ref: string | null;
      position: number;
    }> | null;
    error: unknown;
  };
  if (got.error) throw got.error;
  const row = [...(got.data ?? [])].sort((a, b) => a.position - b.position)[0];
  const fromSettings = row?.settings?.mailbox;
  if (typeof fromSettings === "string" && fromSettings) return fromSettings;
  if (row?.provider_ref) return row.provider_ref;
  throw new Error("Für das Postfach ist im Admin-Bereich keine Adresse hinterlegt.");
}

/** Forget what was cached, for when a credential has just been changed. */
export function forgetChannelCredentials(): void {
  cache.clear();
}
