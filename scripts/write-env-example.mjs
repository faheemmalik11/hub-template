// Writes .env.example from the schema in src/config/env.ts, so the two cannot drift.
// Run after changing the schema: node scripts/write-env-example.mjs
import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("src/config/env.ts", "utf8");

const schemaBlock = source.slice(
  source.indexOf("export const envSchema"),
  source.indexOf("export const ENV_DESCRIPTIONS"),
);
const names = [...new Set([...schemaBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]))];

const descriptionsBlock = source.slice(
  source.indexOf("export const ENV_DESCRIPTIONS"),
  source.indexOf("function readEnv()"),
);
const descriptions = Object.fromEntries(
  [...descriptionsBlock.matchAll(/([A-Z][A-Z0-9_]+):\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [
    m[1],
    m[2],
  ]),
);

const lines = [
  "# The bootstrap, and only this. Everything else a client configures is a row in their own",
  "# database. Generated from src/config/env.ts by scripts/write-env-example.mjs.",
  "",
];
for (const name of names) {
  if (descriptions[name]) lines.push(`# ${descriptions[name]}`);
  lines.push(`${name}=`, "");
}
lines.push("# Names the local Docker containers. Only the Supabase CLI reads it, never the app.");
lines.push("SUPABASE_PROJECT_ID=hub_template", "");

writeFileSync(".env.example", lines.join("\n"));
console.log(`.env.example written with ${names.length} variables`);
