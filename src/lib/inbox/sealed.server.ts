// Opens a "v2" sealed credential, the format the admin panel has written since each client got a key
// of its own (book-keeping, src/composition/config/tenant_keys.py). The master key
// (SECRET_ENCRYPTION_KEY) no longer opens these, only the client's key (TENANT_SECRET_KEY) does.
//
// Web Crypto only, so it runs wherever the Hub builds for. Open only. The Hub never writes a credential.
//
// A token is "v2.<nonce>.<sealed>", both parts unpadded base64url: a 12-byte nonce, then AES-256-GCM
// ciphertext with its 16-byte tag appended. The additional data binds the value to where it is
// stored, "channel-credential/<channel_key>/<name>", so a value copied under another name or source
// does not open.

const VERSION = "v2";

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function looksSealed(value: string): boolean {
  return value.startsWith(`${VERSION}.`);
}

export async function openSealed(
  token: string,
  tenantKey: string,
  channelKey: string,
  name: string,
): Promise<string> {
  const keyBytes = fromBase64Url(tenantKey.trim());
  if (keyBytes.length !== 32) throw new Error("invalid key");
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error("invalid token");

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64Url(parts[1]),
      additionalData: new TextEncoder().encode(`channel-credential/${channelKey}/${name}`),
    },
    key,
    fromBase64Url(parts[2]),
  );
  return new TextDecoder().decode(plain);
}
