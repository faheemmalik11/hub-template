// Generates the table rename migration from a schema dump, and its rollback.
//
//   ./scripts/dump-live-schema.sh
//   npx tsx scripts/generate-rename-migration.ts
//
// Generated, never hand-written. MAYESTATE's first draft was built from the pipeline's own DDL
// and was wrong in six places: it listed six tables carrying invoice_id where the dump showed
// twelve, and had invented two pairs that did not exist at all. Every statement this emits names
// something the dump says is there.
//
// Re-run it if the schema moves before the migration is applied.
//
// What a rename does NOT carry, and therefore what this has to emit:
//   - function bodies, stored as source. Left alone they fail at their next call.
//   - string literals inside a view (v_trash_base emits 'invoices'::text as a column value).
//   - a view's own output column names. CREATE OR REPLACE VIEW refuses to change them, so all
//     11 views come down and go back up, dependents first.
//   - table names stored as data, and the jsonb keys the Hub reads back.
//   - the PostgREST schema cache, which answers 404 on every new name until told.
//
// What it must NOT touch: the six dotted permission scopes. They are masked before the rename
// runs and restored after. Renaming one makes every RLS policy behind it deny everyone.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DUMP = process.argv[2] ?? "supabase/_backup/rename-snapshot/latest/public.sql";
const OUT_DIR = "supabase/migrations";
const STAMP = "20260916120000";
const ROLLBACK_STAMP = "20260916120001";

/** The pipeline's map, from book-keeping src/adapters/db/schema_translation.py. */
const TABLES: Record<string, string> = {
  invoices: "documents",
  invoice_files: "document_files",
  invoice_history: "document_history",
  invoice_line_items: "document_line_items",
  invoice_tax: "document_taxes",
  invoice_bank_accounts: "document_bank_accounts",
  imported_messages: "imported_items",
  folder_bookmarks: "read_cursors",
  bwa_categories: "categories",
  bwa_category_aliases: "category_aliases",
};

const COLUMNS: Record<string, string> = {
  invoice_id: "document_id",
  gmail_message_id: "source_item_id",
  name_de: "name",
  ki_used: "ai_calls",
};

/**
 * Left alone. StäyHub's permission scopes are dotted, so a whole-word match on `invoices` hits
 * inside every one of them. Confirmed against public.permissions: these six and no others.
 */
const SCOPES = [
  "invoices.approve_final",
  "invoices.override_workflow",
  "invoices.approve",
  "invoices.assign",
  "invoices.book",
  "invoices.pay",
];

/** The panel's provisioning steps, from book-keeping schema/0001 to 0005. */
const LEDGER: Array<[string, string[]]> = [
  ["0001_tenant_settings", ["tenant_settings", "tenant_settings_history", "credential_reads"]],
  [
    "0002_channels",
    ["channels", "channel_state", "channel_folders", "read_cursors", "ingest_exclusions"],
  ],
  [
    "0003_master_data",
    [
      "companies",
      "properties",
      "property_companies",
      "entity_aliases",
      "suppliers",
      "supplier_bank_accounts",
      "categories",
      "category_aliases",
      "vat_rates",
    ],
  ],
  [
    "0004_documents",
    [
      "documents",
      "document_files",
      "document_history",
      "document_line_items",
      "document_taxes",
      "document_bank_accounts",
      "imported_items",
      "processing_log",
      "pipeline_runs",
    ],
  ],
  ["0005_credentials", ["credentials"]],
];

const ALL = { ...TABLES, ...COLUMNS };
const WORDS = Object.keys(ALL).sort((a, b) => b.length - a.length);
const WORD_RE = new RegExp(`\\b(${WORDS.join("|")})\\b`, "g");
const NAMES_ONE = new RegExp(`\\b(${WORDS.join("|")})\\b`);

/**
 * Apply the rename to SQL text, with the permission scopes held out of it.
 *
 * The scopes are masked as bare tokens, not only as quoted literals, because they also turn up
 * unquoted in comments ("requires invoices.book"). None of the six suffixes is a real column on
 * invoices, checked against information_schema, so masking the bare token cannot hide a genuine
 * table.column reference.
 */
function rename(sql: string): string {
  let masked = sql;
  SCOPES.forEach((scope, i) => {
    masked = masked.split(scope).join(`\u0000SCOPE${i}\u0000`);
  });
  masked = masked.replace(WORD_RE, (m) => ALL[m]);
  SCOPES.forEach((scope, i) => {
    masked = masked.split(`\u0000SCOPE${i}\u0000`).join(scope);
  });
  return masked;
}

/**
 * Split the dump into top-level statements.
 *
 * Dollar quoting is tracked with a generic tag, because pg_dump writes $$ for most bodies and
 * $_$ where the body contains one. A splitter that only knows $$ runs past the end of a function
 * and swallows the next one whole.
 */
function statements(src: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  let open: string | null = null;

  const tagAt = (n: number): string | null => {
    if (src[n] !== "$") return null;
    if (src[n + 1] === "$") return "$$";
    return /^\$[A-Za-z_][A-Za-z_0-9]*\$/.exec(src.slice(n, n + 64))?.[0] ?? null;
  };

  while (i < src.length) {
    // Inside a dollar-quoted body everything is literal until the matching tag. Parsing comments
    // or quotes in there is what breaks: a body comment holding an apostrophe starts a string
    // scan that runs past the closing $$ and swallows every statement after it.
    if (open !== null) {
      const tag = tagAt(i);
      if (tag === open) {
        open = null;
        i += tag.length;
      } else {
        i++;
      }
      continue;
    }

    const ch = src[i];
    if (ch === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i++;
      i++;
      continue;
    }
    const tag = tagAt(i);
    if (tag) {
      open = tag;
      i += tag.length;
      continue;
    }
    if (ch === ";") {
      out.push(src.slice(start, i + 1).trim());
      i++;
      start = i;
      continue;
    }
    i++;
  }
  const tail = src.slice(start).trim();
  if (tail) out.push(tail);
  return out.map(stripBanner).filter(Boolean);
}

/** Drop the leading comment banner pg_dump writes before each statement. */
function stripBanner(s: string): string {
  const lines = s.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith("--"))) i++;
  return lines.slice(i).join("\n").trim();
}

const dump = readFileSync(DUMP, "utf8");
const stmts = statements(dump);

// ---- what the dump says is actually there ------------------------------------------------
const tablesPresent = new Set<string>();
const columnsOf = new Map<string, string[]>();
for (const s of stmts) {
  const m = /^CREATE TABLE(?: IF NOT EXISTS)? "public"\."([a-z_0-9]+)" \(([\s\S]*)\)\s*;$/.exec(s);
  if (!m) continue;
  tablesPresent.add(m[1]);
  const cols = [...m[2].matchAll(/^\s*"([a-z_0-9]+)"\s/gm)].map((c) => c[1]);
  columnsOf.set(m[1], cols);
}

const views: Array<{ name: string; create: string }> = [];
const viewExtras = new Map<string, string[]>();
for (const s of stmts) {
  const c = /^CREATE OR REPLACE VIEW "public"\."([a-z_0-9]+)"/.exec(s);
  if (c) {
    views.push({ name: c[1], create: s });
    continue;
  }
  const o = /^ALTER VIEW "public"\."([a-z_0-9]+)" OWNER TO/.exec(s);
  const g = /^GRANT [\s\S]*? ON TABLE "public"\."([a-z_0-9]+)"/.exec(s);
  const name = o?.[1] ?? g?.[1];
  if (name) {
    if (!viewExtras.has(name)) viewExtras.set(name, []);
    viewExtras.get(name)!.push(s);
  }
}
const viewNames = new Set(views.map((v) => v.name));

/**
 * Functions that take a view's row type as a parameter, the PostgREST computed-field pattern
 * (is_direct_debit(v_invoices_review) exposes a virtual column on the view).
 *
 * Postgres refuses to drop a view while one of these exists: "cannot drop view X because other
 * objects depend on it ... function depends on type X". So they come down before the views and
 * go back up after, with their owner and grants. The rehearsal is what found this.
 */
type ViewFn = { sig: string; drop: string; stmts: string[] };
const viewFns: ViewFn[] = [];
for (const s of stmts) {
  const m = /^CREATE OR REPLACE FUNCTION "public"\."([a-z_0-9]+)"\(([^)]*)\)/.exec(s);
  if (!m) continue;
  const view = /"public"\."(v_[a-z_0-9]+)"/.exec(m[2]);
  if (!view) continue;
  const sig = `"public"."${m[1]}"(${m[2]})`;
  viewFns.push({
    sig,
    drop: `drop function if exists public.${m[1]}(public.${view[1]});`,
    stmts: stmts.filter((o) => o.includes(sig)),
  });
}
const viewFnSigs = new Set(viewFns.flatMap((f) => f.stmts));

const functions = stmts.filter(
  (s) => /^CREATE OR REPLACE FUNCTION/.test(s) && NAMES_ONE.test(s) && !viewFnSigs.has(s),
);

// ---- the pieces --------------------------------------------------------------------------
const tableRenames = Object.entries(TABLES)
  .filter(([from]) => tablesPresent.has(from))
  .sort(([a], [b]) => a.localeCompare(b));

const columnRenames: Array<[string, string, string]> = [];
for (const [table, cols] of [...columnsOf].sort()) {
  for (const col of cols) {
    if (COLUMNS[col]) columnRenames.push([TABLES[table] ?? table, col, COLUMNS[col]]);
  }
}
columnRenames.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

const L: string[] = [];
const p = (s = "") => L.push(s);
const rule = (n: string) => p(`-- ${"-".repeat(Math.max(0, 76 - n.length))} ${n}`);

p(`-- English table names for StäyHub, so this database speaks the same vocabulary as the`);
p(`-- book-keeping pipeline and the admin panel's onboarding provisions.`);
p(`--`);
p(`-- GENERATED by scripts/generate-rename-migration.ts from a schema dump of the live database,`);
p(`-- so every statement below names something that is actually there. Re-generate it if the`);
p(`-- schema moves before it is applied.`);
p(`--`);
p(`-- A rename carries views, policies, indexes, foreign keys, sequences, triggers and grants,`);
p(`-- because Postgres stores those as parsed references. It does NOT carry function bodies,`);
p(`-- string literals inside a view, a view's own output column names, or table names stored as`);
p(`-- data. Each of those has a section here.`);
p(`--`);
p(`-- The six dotted permission scopes (invoices.pay, invoices.approve, ...) are NOT renamed.`);
p(`-- They are permission keys, not tables. Renaming one makes every policy behind it deny`);
p(`-- everyone.`);
p(`--`);
p(`-- No row is copied. Every statement is a catalogue change, so this runs in milliseconds.`);
p();
p("begin;");
p();

rule(`1. the tables (${tableRenames.length})`);
for (const [from, to] of tableRenames) p(`alter table public.${from} rename to ${to};`);
p();

rule(`2. the columns (${columnRenames.length})`);
p(`-- Every table that actually carries one, read from the dump rather than assumed. The table`);
p(`-- names below are the post-rename ones, because section 1 has already run.`);
for (const [table, from, to] of columnRenames)
  p(`alter table public.${table} rename column ${from} to ${to};`);
p();

rule(`3. the views come down (${views.length})`);
p(`-- A view's reference to a table follows a rename, but a string constant inside it does not,`);
p(`-- and CREATE OR REPLACE VIEW cannot rename a view's own output columns. Four of these carry`);
p(`-- gmail_message_id as an output column and v_trash_base emits 'invoices' as a value, so all`);
p(`-- of them come down here, dependents first, and go back up in section 5.`);
if (viewFns.length > 0) {
  p(`-- First the computed-field functions that take a view's row type, or the drop below is`);
  p(`-- refused: "cannot drop view ... because other objects depend on it". They go back up with`);
  p(`-- the views in section 5.`);
  for (const f of viewFns) p(f.drop);
  p();
}
for (const v of [...views].reverse()) p(`drop view if exists public.${v.name};`);
p();

rule(`4. the functions (${functions.length})`);
p(`-- Stored as source, so a rename does not reach them. Left alone they fail at their next call,`);
p(`-- which may be days away and in the hands of somebody else. No signature moves here, so every`);
p(`-- one is a REPLACE and nothing has to be dropped first.`);
p();
for (const f of functions) {
  p(rename(f));
  p();
}

rule(`5. the views go back up (${views.length})`);
for (const v of views) {
  p(rename(v.create));
  for (const extra of viewExtras.get(v.name) ?? []) p(rename(extra));
  p();
}

if (viewFns.length > 0) {
  p(`-- The computed-field functions dropped in section 3, now that their view type exists again.`);
  p();
  for (const f of viewFns) {
    for (const st of f.stmts) p(rename(st));
    p();
  }
}

rule("6. table names stored as data");
p(`-- change_history.table_name points at a table; it is not a recorded fact about the business,`);
p(`-- so it moves with the table. Left behind, restore-from-trash looks for a table that is not`);
p(`-- there. No row names one of these today, but one can appear before the cutover.`);
for (const [from, to] of tableRenames) {
  p(`update public.change_history set table_name = '${to}' where table_name = '${from}';`);
}
p();
p(`-- The Hub reads payload.document_id (src/lib/data/use-notification-items.ts), so the triggers`);
p(`-- rewritten in section 4 now emit that key. The rows already written need the same.`);
p(`update public.notification_events`);
p(
  `   set payload = (payload - 'invoice_id') || jsonb_build_object('document_id', payload->'invoice_id')`,
);
p(` where payload ? 'invoice_id';`);
p();

rule("7. tell the panel what is already set up");
p(`-- The panel refuses to provision a database holding tables it did not create, and stands that`);
p(`-- refusal down only once one of its own steps is recorded. A step is recorded only when every`);
p(`-- table it owns exists, checked at runtime, so the ledger never claims a half step.`);
p(`create table if not exists public.schema_migrations (`);
p(`    id text primary key check (length(btrim(id)) > 0),`);
p(`    applied_at timestamptz not null default now()`);
p(`);`);
p(`alter table public.schema_migrations enable row level security;`);
p();
p(`do $ledger$`);
p(`declare`);
p(`    step record;`);
p(`begin`);
p(`    for step in`);
p(`        select * from (values`);
LEDGER.forEach(([id, tabs], i) => {
  const comma = i === LEDGER.length - 1 ? "" : ",";
  p(`            ('${id}', array[${tabs.map((t) => `'${t}'`).join(", ")}])${comma}`);
});
p(`        ) as t(id, tables)`);
p(`    loop`);
p(`        if not exists (select 1 from unnest(step.tables) as name`);
p(`                        where to_regclass('public.' || name) is null) then`);
p(
  `            insert into public.schema_migrations (id) values (step.id) on conflict (id) do nothing;`,
);
p(`            raise notice 'recorded % as already set up', step.id;`);
p(`        else`);
p(
  `            raise notice 'step % is not complete here; the panel will offer what is missing', step.id;`,
);
p(`        end if;`);
p(`    end loop;`);
p(`end $ledger$;`);
p();
p("commit;");
p();
p(`-- PostgREST answers from a cached schema, so until it reloads every request for a new name is`);
p(`-- a 404. Outside the transaction: a signal, not a change.`);
p(`notify pgrst, 'reload schema';`);

writeFileSync(join(OUT_DIR, `${STAMP}_english_table_names.sql`), L.join("\n") + "\n");

// ---- the rollback ------------------------------------------------------------------------
// Generated the same way and from the same dump, so it carries the previous function and view
// definitions verbatim rather than a note asking somebody to find them.
const R: string[] = [];
const q = (s = "") => R.push(s);
q(`-- The reverse of ${STAMP}_english_table_names.sql, kept as .txt so it is never applied by`);
q(`-- accident. Rename it to .sql only to roll back, and only with the Hub and the Edge Functions`);
q(`-- rolled back with it.`);
q(`--`);
q(`-- GENERATED from the same dump as the forward migration, so the function and view definitions`);
q(`-- below are the ones that were live before it ran, verbatim.`);
q(`--`);
q(`-- Same cost as going forward: no row is copied.`);
q();
q("begin;");
q();
q(
  `-- The panel's ledger goes first: leaving a step recorded against tables that have gone back to`,
);
q(`-- their old names would tell it this database is set up when it is not.`);
q(`delete from public.schema_migrations`);
q(` where id in (${LEDGER.map(([id]) => `'${id}'`).join(", ")});`);
q();
q(`-- The views name the new tables, so they come down before the tables go back, and the`);
q(`-- computed-field functions come down before the views.`);
for (const f of viewFns) q(f.drop);
for (const v of [...views].reverse()) q(`drop view if exists public.${v.name};`);
q();
for (const [table, from, to] of [...columnRenames].reverse()) {
  q(`alter table public.${table} rename column ${to} to ${from};`);
}
q();
for (const [from, to] of [...tableRenames].reverse())
  q(`alter table public.${to} rename to ${from};`);
q();
for (const [from, to] of tableRenames) {
  q(`update public.change_history set table_name = '${from}' where table_name = '${to}';`);
}
q();
q(`update public.notification_events`);
q(
  `   set payload = (payload - 'document_id') || jsonb_build_object('invoice_id', payload->'document_id')`,
);
q(` where payload ? 'document_id';`);
q();
q(`-- The functions and views as they were before the rename.`);
q();
for (const f of functions) {
  q(f);
  q();
}
for (const v of views) {
  q(v.create);
  for (const extra of viewExtras.get(v.name) ?? []) q(extra);
  q();
}
for (const f of viewFns) {
  for (const st of f.stmts) q(st);
  q();
}
q("commit;");
q();
q(`notify pgrst, 'reload schema';`);

writeFileSync(
  join(OUT_DIR, `${ROLLBACK_STAMP}_english_table_names_rollback.sql.txt`),
  R.join("\n") + "\n",
);

console.error(
  [
    `tables in the dump:        ${tablesPresent.size}`,
    `table renames:             ${tableRenames.length}`,
    `column renames:            ${columnRenames.length}`,
    `views dropped/recreated:   ${views.length}`,
    `functions recreated:       ${functions.length}`,
    `view-typed functions:      ${viewFns.length}`,
    `views with grants restored:${[...viewExtras.keys()].filter((n) => viewNames.has(n)).length}`,
    ``,
    `wrote ${OUT_DIR}/${STAMP}_english_table_names.sql`,
    `wrote ${OUT_DIR}/${ROLLBACK_STAMP}_english_table_names_rollback.sql.txt`,
  ].join("\n"),
);
