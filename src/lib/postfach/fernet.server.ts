// Fernet decryption, server side only.
//
// The admin panel and the ingestion pipeline store every channel credential in
// `public.credentials` encrypted with Fernet (Python `cryptography`), under the key their
// environment calls SECRET_ENCRYPTION_KEY. A stored value always begins `gAAAAAB`. This reads
// them so the Hub can use the same credentials rather than keeping a second copy in its own .env.
//
// Decrypt only. The Hub never writes a credential: that is the panel's job, and a writer here
// would be a second way to set a secret with no audit trail behind it.
//
// WEB CRYPTO, NOT node:crypto. Modules that are not server functions (invoice-intent-config.ts,
// voice-entity-resolution.ts) import the credential reader, so this file reaches the browser module
// graph in dev. A `node:crypto` import there is externalized by Vite and the whole app failed to
// load locally ("Module node:crypto has been externalized for browser compatibility", 17.09.2026),
// while the production build tree-shook it and hid the problem. Web Crypto exists in Node, in
// browsers and on Vercel, so the module is harmless wherever it is loaded; it only ever runs on the
// server. Same implementation as the Immonetz Hub and Eiffler's Edge Functions.
//
// SPEC (github.com/fernet/spec). A token is base64url over:
//   0x80              version, 1 byte
//   timestamp         8 bytes, big endian, seconds
//   iv                16 bytes
//   ciphertext        AES-128-CBC, PKCS7 padded
//   hmac              32 bytes, SHA256 over everything before it
// The key is base64url over 32 bytes: the first 16 sign, the last 16 encrypt.
//
// THE HMAC IS VERIFIED BEFORE DECRYPTING, with Web Crypto's constant-time verify. Skipping it, or
// checking it after, turns this into a padding oracle. There is no TTL check: these credentials are
// meant to be long-lived and a rotation replaces the row.

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Every Fernet token starts with version 0x80, which base64url spells "gAAAAA". */
export function looksEncrypted(value: string): boolean {
  return value.startsWith("gAAAAA");
}

export async function fernetDecrypt(token: string, key: string): Promise<string> {
  const keyBytes = fromBase64Url(key.trim());
  if (keyBytes.length !== 32) throw new Error("invalid key");
  const data = fromBase64Url(token.trim());
  if (data.length < 57 || data[0] !== 0x80) throw new Error("invalid token");

  const signed = data.slice(0, data.length - 32);
  const mac = data.slice(data.length - 32);
  const signingKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.slice(0, 16),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("HMAC", signingKey, mac, signed))) {
    throw new Error("invalid token");
  }

  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.slice(16),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: data.slice(9, 25) },
    encryptionKey,
    data.slice(25, data.length - 32),
  );
  return new TextDecoder().decode(plain);
}
