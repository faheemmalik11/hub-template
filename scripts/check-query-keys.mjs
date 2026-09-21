// Reports React Query keys that are read but never invalidated, and the reverse.
//
//   node scripts/check-query-keys.mjs
//
// A key typed in two places that differ by a character is the classic bug in this layer: the write
// succeeds, nothing refetches, and the screen quietly shows stale data. No test catches it, because
// both halves work in isolation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const read = new Map();
const invalidated = new Map();

for (const path of walk("src/data")) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/queryKey:\s*\[\s*"([a-z_0-9-]+)"/g)) {
    if (!read.has(match[1])) read.set(match[1], new Set());
    read.get(match[1]).add(path);
  }
  for (const match of source.matchAll(/invalidateQueries\(\{\s*queryKey:\s*\[\s*"([a-z_0-9-]+)"/g)) {
    if (!invalidated.has(match[1])) invalidated.set(match[1], new Set());
    invalidated.get(match[1]).add(path);
  }
}

const neverInvalidated = [...read.keys()].filter((key) => !invalidated.has(key)).sort();
const invalidatedButNeverRead = [...invalidated.keys()].filter((key) => !read.has(key)).sort();

console.log(`\n${read.size} keys read, ${invalidated.size} invalidated`);

console.log(`\n=== invalidated but never read (${invalidatedButNeverRead.length})`);
console.log("    a write refreshes a key nothing fetches: usually a typo in one half");
for (const key of invalidatedButNeverRead) {
  console.log(`  ${key}  (${[...invalidated.get(key)].map((p) => p.replace("src/data/", "")).join(", ")})`);
}

console.log(`\n=== read but never invalidated (${neverInvalidated.length})`);
console.log("    fine for data nothing writes; suspicious for anything editable");
console.log(`  ${neverInvalidated.join(", ")}`);
console.log("");

process.exit(invalidatedButNeverRead.length === 0 ? 0 : 1);
