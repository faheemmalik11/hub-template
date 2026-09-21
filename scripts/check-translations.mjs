// Every key a screen asks for exists, in both locales.
//
//   node scripts/check-translations.mjs
//
// tsc cannot see a translation key, so a renamed namespace fails silently: the screen renders the
// key itself. This is the only thing that catches it before a person does.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function keysOf(path) {
  const source = readFileSync(path, "utf8");
  const keys = new Set();
  const stack = [];
  for (const line of source.split("\n")) {
    const open = line.match(/^(\s+)([a-zA-Z_][\w]*):\s*\{\s*$/);
    const leaf = line.match(/^(\s+)([a-zA-Z_][\w]*):\s*(?!\{)(?:.|$)/);
    const close = line.match(/^(\s+)\},?\s*$/);
    if (open) {
      stack.push({ indent: open[1].length, key: open[2] });
      continue;
    }
    if (leaf) {
      const depth = stack.filter((entry) => entry.indent < leaf[1].length).map((entry) => entry.key);
      keys.add([...depth, leaf[2]].join("."));
      continue;
    }
    if (close) {
      while (stack.length && stack[stack.length - 1].indent >= close[1].length) stack.pop();
    }
  }
  return keys;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

const de = keysOf("src/lib/i18n/locales/de.ts");
const en = keysOf("src/lib/i18n/locales/en.ts");

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

const missing = [...used].filter(([key]) => !de.has(key) || !en.has(key));
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
