const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export async function sha256Hex(file: Blob): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const bytes = new Uint8Array(digest);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i]];
    return out;
  } catch {
    return null;
  }
}
