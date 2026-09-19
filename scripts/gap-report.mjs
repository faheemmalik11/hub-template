// Measures the distance between a client's live database and this template.
//
//   node scripts/gap-report.mjs "postgresql://user:pass@host:5432/postgres"
//
// Reads only. Prints what the client has that the template does not, what the template has that
// they lack, and which stored values still use the old vocabulary. Nothing is decided from this
// alone; it is the first step of planning/12-adopting-an-existing-client.md.
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/gap-report.mjs <client database url>");
  process.exit(1);
}

const query = (sql) =>
  execFileSync("psql", [url, "-t", "-A", "-F", "\t", "-c", sql], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const schemaFiles = readdirSync("supabase/schema").filter((name) => /^\d+_.*\.sql$/.test(name));
const schemaSql = schemaFiles
  .map((name) => readFileSync(`supabase/schema/${name}`, "utf8"))
  .join("\n");

const templateTables = new Set(
  [...schemaSql.matchAll(/create table if not exists public\.([a-z_0-9]+)/g)].map((m) => m[1]),
);
const templateViews = new Set(
  [...schemaSql.matchAll(/create or replace view public\.([a-z_0-9]+)/g)].map((m) => m[1]),
);
const templateFunctions = new Set(
  [...schemaSql.matchAll(/create or replace function public\.([a-z_0-9]+)/gi)].map((m) =>
    m[1].toLowerCase(),
  ),
);

const theirTables = new Set(query("select tablename from pg_tables where schemaname='public'"));
const theirViews = new Set(query("select viewname from pg_views where schemaname='public'"));
const theirFunctions = new Set(
  query(
    "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
  ).map((name) => name.toLowerCase()),
);

const only = (a, b) => [...a].filter((x) => !b.has(x)).sort();

const OLD_VALUES = {
  workflow_status: ["eingegangen", "in_pruefung", "rueckfrage", "freigegeben_assistenz",
                    "freigegeben_vorgesetzter", "bezahlt", "uebergeben_datev", "abgeschlossen",
                    "abgelehnt", "nicht_relevant"],
  traffic_light: ["gruen", "gelb", "rot"],
  status: ["erkannt", "zu_pruefen", "aufgeteilt"],
};

const documentsTable = theirTables.has("documents") ? "documents" : theirTables.has("invoices") ? "invoices" : null;

console.log(`\n=== tables`);
console.log(`  theirs ${theirTables.size}, template ${templateTables.size}`);
console.log(`  only theirs: ${only(theirTables, templateTables).join(", ") || "none"}`);
console.log(`  only template: ${only(templateTables, theirTables).join(", ") || "none"}`);

console.log(`\n=== views`);
console.log(`  only theirs: ${only(theirViews, templateViews).join(", ") || "none"}`);
console.log(`  only template: ${only(templateViews, theirViews).join(", ") || "none"}`);

console.log(`\n=== functions`);
console.log(`  theirs ${theirFunctions.size}, template ${templateFunctions.size}`);
console.log(`  missing from theirs: ${only(templateFunctions, theirFunctions).slice(0, 20).join(", ") || "none"}`);

console.log(`\n=== stored vocabulary`);
if (!documentsTable) {
  console.log("  no documents or invoices table, so nothing to compare");
} else {
  for (const [column, oldValues] of Object.entries(OLD_VALUES)) {
    const exists = query(
      `select 1 from information_schema.columns where table_schema='public' and table_name='${documentsTable}' and column_name='${column}'`,
    ).length;
    if (!exists) continue;
    const rows = query(
      `select ${column}, count(*) from public.${documentsTable} where ${column} is not null group by 1 order by 2 desc`,
    );
    const stillOld = rows.filter((row) => oldValues.includes(row.split("\t")[0]));
    console.log(
      `  ${documentsTable}.${column}: ${stillOld.length ? stillOld.map((r) => r.replace("\t", " x")).join(", ") : "already English"}`,
    );
  }
}

console.log(`\n=== permission model`);
for (const name of ["permissions", "role_permissions", "user_permissions", "feature_settings", "feature_requirements"]) {
  console.log(`  ${name.padEnd(22)} ${theirTables.has(name) ? "present" : "MISSING"}`);
}
const catalogueColumns = query(
  "select column_name from information_schema.columns where table_schema='public' and table_name='permissions'",
);
for (const column of ["parent_key", "kind", "default_enabled", "locked"]) {
  console.log(`  permissions.${column.padEnd(16)} ${catalogueColumns.includes(column) ? "present" : "MISSING"}`);
}
console.log("");
