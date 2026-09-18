/**
 * Stage pdf.js's WebAssembly decoders where the browser can fetch them.
 *
 * pdf.js 6 decodes JBIG2 and JPEG2000 in WebAssembly and loads those modules BY NAME from the
 * directory given to getDocument({ wasmUrl }) at runtime. That rules out a `?url` import, which
 * Vite would hash into a filename pdf.js cannot ask for, so the files have to sit at a stable
 * path under public/.
 *
 * They are copied here rather than committed: they are 1.1 MB of binaries that belong to
 * pdfjs-dist, and a checked-in copy silently goes stale the day the package is upgraded -- with
 * a failure mode that is easy to miss, because a stale or missing decoder does not throw. pdf.js
 * logs a warning and drops every image the decoder owned, so a scanned invoice renders as a blank
 * page with its letterhead still on it.
 *
 * Runs on postinstall and before dev/build, so a fresh clone cannot start without them.
 */
import { cp, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist", "wasm");
const to = join(root, "public", "pdfjs", "wasm");

// Everything except quickjs, which is only for JavaScript embedded in PDF forms -- this app
// renders documents, it never executes them.
const WANTED = [
  "jbig2.wasm",
  "jbig2_nowasm_fallback.js",
  "openjpeg.wasm",
  "openjpeg_nowasm_fallback.js",
  "qcms_bg.wasm",
  "LICENSE_JBIG2",
  "LICENSE_PDFJS_JBIG2",
  "LICENSE_OPENJPEG",
  "LICENSE_PDFJS_OPENJPEG",
  "LICENSE_QCMS",
  "LICENSE_PDFJS_QCMS",
];

try {
  await access(from);
} catch {
  // Not an error: `npm ci --omit=optional` and the like can run this before pdfjs-dist is there.
  console.warn("copy-pdfjs-wasm: pdfjs-dist/wasm not found, skipping");
  process.exit(0);
}

await mkdir(to, { recursive: true });
for (const name of WANTED) {
  await cp(join(from, name), join(to, name));
}
console.log(`copy-pdfjs-wasm: ${WANTED.length} files -> public/pdfjs/wasm`);
