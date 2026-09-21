// Every column the ingestion pipeline writes exists in this schema.
//
//   node scripts/check-pipeline-columns.mjs [path/to/registry.generated.json]
//
// The pipeline writes rows into a Hub database. A column it writes and this schema does not
// declare fails the whole run, and nothing else here would catch it: the tables compile, the
// screens render, and the failure only appears the first time a client's pipeline runs.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REGISTRY =
  process.argv[2] ??
  "../book-keeping/admin-ui/src/lib/registry.generated.json";

let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
} catch (error) {
  console.log(`\nCannot read the pipeline registry at ${REGISTRY}`);
  console.log(`  ${error.message}`);
  console.log("\nPass its path as the first argument if the panel lives somewhere else.\n");
  process.exit(2);
}

const schemaDir = "supabase/schema";
const sql = readdirSync(schemaDir)
  .filter((name) => /^0\d+_.*\.sql$/.test(name))
  .map((name) => readFileSync(join(schemaDir, name), "utf8"))
  .join("\n");

// What this schema declares, from both shapes it uses: the create, and the alter that adds a
// column to a table created earlier in the same file.
function declaredColumns() {
  const columns = new Map();
  const add = (table, column) => {
    if (!columns.has(table)) columns.set(table, new Set());
    columns.get(table).add(column);
  };

  for (const match of sql.matchAll(
    /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g,
  )) {
    const [, table, body] = match;
    for (const line of body.split("\n")) {
      const column = line.match(/^\s{4}([a-z_][a-z0-9_]*)\s+/i);
      if (column && !/^(constraint|primary|unique|foreign|check)$/i.test(column[1])) {
        add(table, column[1]);
      }
    }
  }

  for (const match of sql.matchAll(
    /alter table public\.(\w+)\s+add column(?: if not exists)?\s+([a-z_][a-z0-9_]*)/gi,
  )) {
    add(match[1], match[2]);
  }

  return columns;
}

const declared = declaredColumns();
const missing = [];

for (const step of registry.provisioning?.steps ?? []) {
  for (const [table, columns] of Object.entries(step.columns ?? {})) {
    for (const column of columns) {
      if (!declared.get(table)?.has(column)) missing.push(`${table}.${column}`);
    }
  }
}

console.log(`\n${declared.size} tables declared here, checked against the pipeline's registry`);

if (missing.length === 0) {
  console.log("\nNo gap: every column the pipeline writes exists in this schema.\n");
  process.exit(0);
}

console.log(`\n=== the pipeline writes these, this schema does not declare them (${missing.length})`);
for (const one of missing.sort()) console.log(`  ${one}`);
console.log("\nAdd each to the numbered file that owns its table, then run this again.\n");
process.exit(1);
