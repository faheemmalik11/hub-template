// An Edge Function cannot import from src/, so the files it shares with the app are copied.
// `node scripts/copy-edge-shared.mjs` rewrites the copies; `--check` fails when one has drifted.
import { readFileSync, writeFileSync } from "node:fs";

const pairs = [
  ["src/lib/crm/propstack.ts", "supabase/functions/_shared/propstack.ts"],
  ["src/lib/inbox/sealed.server.ts", "supabase/functions/_shared/sealed.ts"],
];
const header = (source) => `// Copy of ${source}. Edit that file and run scripts/copy-edge-shared.mjs.\n`;
const check = process.argv.includes("--check");
let drifted = false;

for (const [source, target] of pairs) {
  const wanted = header(source) + readFileSync(source, "utf8");
  if (!check) {
    writeFileSync(target, wanted);
    continue;
  }
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {}
  if (current !== wanted) {
    console.error(`${target} differs from ${source}`);
    drifted = true;
  }
}
process.exit(drifted ? 1 : 0);
