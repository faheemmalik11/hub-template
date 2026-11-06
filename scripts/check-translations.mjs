// Every key a screen asks for exists, in both locales.
//
//   node scripts/check-translations.mjs
//
// tsc cannot see a translation key, so a renamed namespace fails silently: the screen renders the
// key itself. This is the only thing that catches it before a person does.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// The dictionaries are loaded as modules rather than read line by line: a group written on one line
// (`col: { scope: "…" }`) is invisible to a line parser, and was reported as missing 40 times.
async function keysOf(path) {
  const dictionary = (await import(resolve(path))).default;
  const keys = new Set();
  const collect = (node, prefix) => {
    for (const [name, value] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${name}` : name;
      if (value && typeof value === "object" && !Array.isArray(value)) collect(value, key);
      else keys.add(key);
    }
  };
  collect(dictionary, "");
  return keys;
}

const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

function resolvesIn(keys, key) {
  return keys.has(key) || PLURAL_SUFFIXES.some((suffix) => keys.has(key + suffix));
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

const de = await keysOf("src/lib/i18n/locales/de.ts");
const en = await keysOf("src/lib/i18n/locales/en.ts");

const used = new Map();
const prefixes = new Map();
for (const path of walk("src")) {
  if (path.includes("/locales/")) continue;
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*)"/g)) {
    if (!used.has(match[1])) used.set(match[1], path);
  }
  for (const match of source.matchAll(/\bt\(\s*`([a-zA-Z][\w.]*)\.\$\{/g)) {
    if (!prefixes.has(match[1])) prefixes.set(match[1], path);
  }
}

const missing = [...used].filter(([key]) => !resolvesIn(de, key) || !resolvesIn(en, key));
const danglingPrefix = [...prefixes].filter(([prefix]) => {
  const under = (keys) => [...keys].some((key) => key.startsWith(`${prefix}.`));
  return !under(de) || !under(en);
});
const onlyDe = [...de].filter((key) => !en.has(key));
const onlyEn = [...en].filter((key) => !de.has(key));

console.log(`\n${de.size} keys in de, ${en.size} in en, ${used.size} asked for by name`);

for (const [label, rows] of [
  ["keys used but missing from a locale", missing.map(([k, p]) => `${k}  (${p})`)],
  ["dynamic prefixes with nothing under them", danglingPrefix.map(([k, p]) => `${k}.*  (${p})`)],
  ["in de but not en", onlyDe],
  ["in en but not de", onlyEn],
]) {
  console.log(`\n=== ${label} (${rows.length})`);
  for (const row of rows.slice(0, 40)) console.log(`  ${row}`);
  if (rows.length > 40) console.log(`  ... and ${rows.length - 40} more`);
}
console.log("");

process.exit(missing.length || danglingPrefix.length || onlyDe.length || onlyEn.length ? 1 : 0);
