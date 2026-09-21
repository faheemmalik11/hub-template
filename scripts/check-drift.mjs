// Compares a client's live database against this template's baseline.
//
//   node scripts/check-drift.mjs "postgresql://…"
//
// Reads only. Reports what the client has that the baseline does not, what the baseline has that
// they lack, and which of their tables carry columns the baseline never declared. A client is
// allowed their own tables in the 9000 file range; anything else is drift worth explaining.
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/check-drift.mjs <client database url>");
  process.exit(1);
}

const query = (sql) =>
  execFileSync("psql", [url, "-t", "-A", "-F", "\t", "-c", sql], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const schemaSql = readdirSync("supabase/schema")
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .map((name) => readFileSync(`supabase/schema/${name}`, "utf8"))
  .join("\n");

const declared = {
  tables: new Set([...schemaSql.matchAll(/create table if not exists public\.([a-z_0-9]+)/g)].map((m) => m[1])),
  views: new Set([...schemaSql.matchAll(/create or replace view public\.([a-z_0-9]+)/g)].map((m) => m[1])),
  functions: new Set(
    [...schemaSql.matchAll(/create or replace function public\.([a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase()),
  ),
};

const live = {
  tables: new Set(query("select tablename from pg_tables where schemaname='public'")),
  views: new Set(query("select viewname from pg_views where schemaname='public'")),
  // Functions an extension brought with it are the extension's, not ours.
  functions: new Set(
    query(`select p.proname
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and not exists (
                select 1 from pg_depend d
                 where d.objid = p.oid and d.deptype = 'e'
              )`).map((name) => name.toLowerCase()),
  ),
};

const only = (a, b) => [...a].filter((name) => !b.has(name)).sort();
let drifted = 0;

for (const kind of ["tables", "views", "functions"]) {
  const theirs = only(live[kind], declared[kind]);
  const missing = only(declared[kind], live[kind]);
  console.log(`\n=== ${kind}`);
  console.log(`  live ${live[kind].size}, baseline ${declared[kind].size}`);
  if (theirs.length) console.log(`  theirs only:    ${theirs.join(", ")}`);
  if (missing.length) console.log(`  MISSING here:   ${missing.join(", ")}`);
  drifted += missing.length;
}

console.log("\n=== columns the baseline never declared");
const shared = [...live.tables].filter((name) => declared.tables.has(name)).sort();
for (const table of shared) {
  const columns = query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='${table}'`,
  );
  const block = schemaSql.slice(
    schemaSql.indexOf(`create table if not exists public.${table} (`),
  );
  // A column may be declared in the create block OR added later by an alter, which is how the
  // search columns arrive: their language is a client setting, so they live in 0009_search.sql.
  const added = [
    ...schemaSql.matchAll(
      new RegExp(`alter table public\\.${table}\\s+add column if not exists ([a-z_0-9]+)`, "g"),
    ),
  ].map((match) => match[1]);
  const body = block.slice(0, block.indexOf(");"));
  const extra = columns.filter(
    (column) => !new RegExp(`\\b${column}\\b`).test(body) && !added.includes(column),
  );
  if (extra.length) {
    console.log(`  ${table}: ${extra.join(", ")}`);
    drifted += extra.length;
  }
}

console.log(
  drifted === 0
    ? "\nNo drift: this database matches the baseline.\n"
    : `\n${drifted} difference(s) the baseline does not account for.\n`,
);
process.exit(drifted === 0 ? 0 : 1);
