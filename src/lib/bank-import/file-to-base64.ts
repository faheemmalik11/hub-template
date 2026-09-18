/** Bare base64 (no "data:...;base64," prefix) — the server adds its own data-URI prefix. */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // btoa needs a binary string; chunk the conversion so a large PDF doesn't blow the call stack
  // via String.fromCharCode(...bytes) on tens of thousands of bytes at once.
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}
