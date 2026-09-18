// The classification pass for the table rename: every quoted string that holds a renamed word,
// read out of the schema dump and sorted into the three things such a string can be.
//
//   npx tsx scripts/classify-rename-strings.ts supabase/_backup/rename-snapshot/latest/public.sql
//   npx tsx scripts/classify-rename-strings.ts supabase/migrations      # cross-check, not truth
//   npx tsx scripts/classify-rename-strings.ts <path> -o worksheet.md
//
// WHY A SCRIPT AND NOT A REGEX. The same word is three different things and no single rule
// separates them:
//
//   1. a permission scope   has_permission('invoices.pay', ...)     LEAVE IT ALONE
//   2. a table name as data p_table = 'invoices'                    RENAME IT
//   3. a jsonb key          jsonb_build_object('invoice_id', ...)   RENAME IT, and the rows too
//
// Renaming a permission scope makes every RLS policy behind it deny everyone. Leaving a table
// name as data behind makes restore-from-trash look for a table that is not there.
//
// StäyHub is harder than MAYESTATE here. MAYESTATE's permission module was the exact string
// 'invoices', so an equality test separated it. StäyHub uses dotted scopes: 'invoices.pay',
// 'invoices.approve', 'invoices.approve_final', 'invoices.assign', 'invoices.book',
// 'invoices.override_workflow'. A whole-word regex matches INSIDE every one of them, because a
// full stop is a word boundary. A blind rewrite silently breaks 54 has_permission call sites.
//
// This script suggests. It does not decide. Every row comes out with an empty decision column,
// and the suggestion is there to make the reading quick, not to skip it.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The pipeline's own map, from book-keeping src/adapters/db/schema_translation.py
// (LEGACY_TO_ENGLISH). Keep the two in step.
const RENAME: Record<string, string> = {
  invoices: "documents",
  invoice_files: "document_files",
  invoice_history: "document_history",
  invoice_line_items: "document_line_items",
  invoice_tax: "document_taxes",
  invoice_bank_accounts: "document_bank_accounts",
  imported_messages: "imported_items",
  receipt_channels: "channels",
  receipt_channel_folders: "channel_folders",
  folder_bookmarks: "read_cursors",
  bwa_categories: "categories",
  bwa_category_aliases: "category_aliases",
  invoice_id: "document_id",
  gmail_message_id: "source_item_id",
  name_de: "name",
  vermerk: "note",
  ki_used: "ai_calls",
};

const TABLE_NAMES = new Set([
  "invoices",
  "invoice_files",
  "invoice_history",
  "invoice_line_items",
  "invoice_tax",
  "invoice_bank_accounts",
  "imported_messages",
  "receipt_channels",
  "receipt_channel_folders",
  "folder_bookmarks",
  "bwa_categories",
  "bwa_category_aliases",
]);

// Longest first, so invoice_files never matches as invoice_ plus something.
const WORDS = Object.keys(RENAME).sort((a, b) => b.length - a.length);
const WORD_RE = new RegExp(`\\b(${WORDS.join("|")})\\b`);

type Verdict = "PERMISSION" | "DYNAMIC_SQL" | "TABLE_AS_DATA" | "JSONB_KEY" | "PROSE" | "UNKNOWN";

type Hit = {
  file: string;
  line: number;
  object: string;
  literal: string;
  context: string;
  suggestion: Verdict;
  why: string;
};

/** A dollar-quote tag at position i, or null. Matches $$ and $_$ and $fn$, never $1. */
function dollarTagAt(src: string, i: number): string | null {
  if (src[i] !== "$") return null;
  if (src[i + 1] === "$") return "$$";
  const match = /^\$[A-Za-z_][A-Za-z_0-9]*\$/.exec(src.slice(i, i + 64));
  return match ? match[0] : null;
}

/**
 * Every CREATE header in the file, so a hit can name the object it sits in. pg_dump writes
 * quoted identifiers, so the name may be "public"."advance_workflow_on_payment"().
 */
function headers(src: string): Array<{ line: number; name: string }> {
  const out: Array<{ line: number; name: string }> = [];
  const re =
    /^[ \t]*CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?(FUNCTION|VIEW|TABLE|POLICY|TRIGGER|RULE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(;]+)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ line, name: `${m[1].toLowerCase()} ${m[2].replace(/"/g, "")}` });
  }
  return out;
}

function objectAt(hdrs: Array<{ line: number; name: string }>, line: number): string {
  let lo = 0;
  let hi = hdrs.length - 1;
  let best = "";
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hdrs[mid].line <= line) {
      best = hdrs[mid].name;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Walk the SQL and yield every single-quoted literal with its line.
 *
 * Dollar quoting is tracked with a generic tag rather than a hard-coded $$, because pg_dump uses
 * $$ for most function bodies and $_$ where the body itself contains one. A parser that only
 * knows $$ runs past the end of a function and swallows the next one whole; in MAYESTATE that
 * silently mis-parsed 22 functions.
 *
 * Inside a dollar-quoted body the single quotes are the inner function's own literals, which is
 * exactly what this pass is looking for, so they are still read.
 */
function* literals(src: string): Generator<{ value: string; line: number }> {
  let i = 0;
  let line = 1;
  const dollars: string[] = [];

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\n") {
      line++;
      i++;
      continue;
    }

    if (ch === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    const tag = dollarTagAt(src, i);
    if (tag) {
      if (dollars.length > 0 && dollars[dollars.length - 1] === tag) dollars.pop();
      else dollars.push(tag);
      i += tag.length;
      continue;
    }

    if (ch === "'") {
      const startLine = line;
      let value = "";
      i++;
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          i++;
          break;
        }
        if (src[i] === "\n") line++;
        value += src[i];
        i++;
      }
      yield { value, line: startLine };
      continue;
    }

    i++;
  }
}

/** `x` or `public.x`, and nothing else, where x is a table that moves. */
function bareTableName(literal: string): boolean {
  return TABLE_NAMES.has(literal.replace(/^public\./, ""));
}

function classify(literal: string, context: string): { suggestion: Verdict; why: string } {
  const lower = context.toLowerCase();
  const segments = literal.split(".");

  // 1. A permission scope. The call it sits in is the strongest signal; has_module_access is
  //    MAYESTATE's name for the same thing.
  if (/has_permission\s*\(|has_module_access\s*\(/.test(lower)) {
    return { suggestion: "PERMISSION", why: "argument to a permission check" };
  }
  // StäyHub's scopes are dotted: invoices.pay, invoices.approve_final, invoices.override_workflow.
  // A second segment that is itself a renamed word means this is a table.column, not a scope.
  if (
    segments.length === 2 &&
    /^[a-z_]+$/.test(segments[0]) &&
    /^[a-z_]+$/.test(segments[1]) &&
    RENAME[segments[0]] !== undefined &&
    RENAME[segments[1]] === undefined &&
    segments[0] !== "public"
  ) {
    return { suggestion: "PERMISSION", why: "dotted scope, first segment is a renamed word" };
  }

  // 2. SQL built as a string and executed later. The identifier inside is real and the rename
  //    has to reach it, but no rename of a table carries it, because it is just text.
  if (
    /\b(alter\s+table|create\s+(or\s+replace\s+)?(table|view|index|function|policy|trigger)|drop\s+(table|view|index|function|policy|trigger|constraint)|select\s+.*\bfrom\b|insert\s+into|update\s+\w|delete\s+from|grant\s+\w|comment\s+on|truncate)\b/i.test(
      literal,
    )
  ) {
    return { suggestion: "DYNAMIC_SQL", why: "SQL assembled as text, executed later" };
  }

  // 3. A table name used as data: a regclass cast, a catalogue lookup, an array of tables the
  //    trash screen walks, a p_table argument, a table_name column.
  if (bareTableName(literal)) {
    if (/::regclass|information_schema|to_regclass|pg_class/.test(lower)) {
      return { suggestion: "TABLE_AS_DATA", why: "a table name resolved through the catalogue" };
    }
    if (
      /table_name|p_table|_table\b|trash_eligible|purge_record|restore_record|::text|array\s*\[/.test(
        lower,
      )
    ) {
      return { suggestion: "TABLE_AS_DATA", why: "a table name passed or stored as a value" };
    }
    // Two or more quoted snake_case tokens on the line: a list of tables.
    if ((lower.match(/'[a-z][a-z_0-9]*'/g) ?? []).length >= 2) {
      return { suggestion: "TABLE_AS_DATA", why: "one of a list of table names" };
    }
    return {
      suggestion: "TABLE_AS_DATA",
      why: "exactly a table name, and StäyHub's permission scopes are dotted so it is not one",
    };
  }

  // 4. A jsonb key the Hub reads back out again.
  if (
    RENAME[literal] !== undefined &&
    /jsonb_build_object|payload|->>|->|jsonb_set|\?\s*'/.test(lower)
  ) {
    return { suggestion: "JSONB_KEY", why: "a key built into or read out of a jsonb payload" };
  }
  if (RENAME[literal] !== undefined && /column_name|attname/.test(lower)) {
    return { suggestion: "TABLE_AS_DATA", why: "a column name checked through the catalogue" };
  }

  // 5. A sentence that happens to mention an old name. Renaming it is cosmetic, but check
  //    whether it reaches a user, because user-facing text is German and is not a schema matter.
  if (/\s/.test(literal.trim()) && literal.trim().split(/\s+/).length >= 2) {
    return { suggestion: "PROSE", why: "a message, not a reference" };
  }

  return { suggestion: "UNKNOWN", why: "read it" };
}

function sqlFiles(path: string): string[] {
  if (statSync(path).isDirectory()) {
    return readdirSync(path)
      .filter((name: string) => name.endsWith(".sql"))
      .map((name: string) => join(path, name))
      .sort();
  }
  return [path];
}

function scan(file: string): Hit[] {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const hdrs = headers(src);
  const hits: Hit[] = [];

  for (const { value, line } of literals(src)) {
    if (!WORD_RE.test(value)) continue;
    const context = (lines[line - 1] ?? "").trim();
    // Classify against a small window, not one line. A jsonb key sits on its own line under the
    // jsonb_build_object that gives it its meaning, and one line of context cannot see that.
    const window = lines
      .slice(Math.max(0, line - 3), line)
      .join(" ")
      .trim();
    const { suggestion, why } = classify(value, window);
    hits.push({
      file,
      line,
      object: objectAt(hdrs, line) || "(top level)",
      literal: value,
      context: context.length > 140 ? `${context.slice(0, 137)}...` : context,
      suggestion,
      why,
    });
  }

  return hits;
}

const ORDER: Verdict[] = [
  "UNKNOWN",
  "DYNAMIC_SQL",
  "TABLE_AS_DATA",
  "JSONB_KEY",
  "PERMISSION",
  "PROSE",
];

const NOTE: Record<Verdict, string> = {
  UNKNOWN: "Nothing decided these. Read each one and fill the decision in.",
  DYNAMIC_SQL:
    "Rename the identifiers inside. A table rename does not reach SQL held as text, so these " +
    "fail at their next execution, which may be days away.",
  TABLE_AS_DATA:
    "Rename these, and add an UPDATE for the rows already written with the old value " +
    "(change_history.table_name, and anything else that stores a table name).",
  JSONB_KEY:
    "Rename the key AND rewrite the payloads already stored, or the Hub reads a key that is " +
    "no longer written.",
  PERMISSION:
    "Leave every one of these alone. Renaming a permission scope makes every RLS policy " +
    "behind it deny everyone. Confirm the list against section 7 of the inventory.",
  PROSE:
    "A message that mentions an old name. Renaming is cosmetic and safe to skip. If it reaches " +
    "a user it is German UI text, which is a separate matter from the schema.",
};

function render(hits: Hit[], inputs: string[]): string {
  const out: string[] = [];
  out.push("# Rename classification worksheet");
  out.push("");
  out.push(`Generated from: ${inputs.join(", ")}`);
  out.push("");
  out.push(
    "Every quoted string holding a word the rename touches. The suggestion is a starting point, " +
      "not a decision. Fill in the decision column for every row before the migration is written.",
  );
  out.push("");
  out.push("| class | rows |");
  out.push("| --- | --- |");
  for (const verdict of ORDER) {
    out.push(`| ${verdict} | ${hits.filter((h) => h.suggestion === verdict).length} |`);
  }
  out.push(`| **total** | **${hits.length}** |`);
  out.push("");

  for (const verdict of ORDER) {
    const rows = hits.filter((h) => h.suggestion === verdict);
    if (rows.length === 0) continue;
    out.push(`## ${verdict} (${rows.length})`);
    out.push("");
    out.push(NOTE[verdict]);
    out.push("");
    out.push("| # | where | object | literal | why suggested | context | DECISION |");
    out.push("| --- | --- | --- | --- | --- | --- | --- |");
    rows.forEach((h, n) => {
      const where = `${h.file.split("/").pop()}:${h.line}`;
      // A literal may run over several lines, and a newline in a cell breaks the table.
      const cell = (text: string) => {
        const flat = text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
        return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
      };
      out.push(
        `| ${n + 1} | ${where} | ${h.object} | \`${cell(h.literal)}\` | ${h.why} | \`${cell(h.context)}\` |  |`,
      );
    });
    out.push("");
  }

  return out.join("\n");
}

const args = process.argv.slice(2);
const outIndex = args.findIndex((a: string) => a === "-o" || a === "--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const inputs = args.filter((_: string, n: number) => n !== outIndex && n !== outIndex + 1);

if (inputs.length === 0) {
  console.error("usage: npx tsx scripts/classify-rename-strings.ts <dump.sql|dir> [-o out.md]");
  process.exit(2);
}

const hits = inputs.flatMap((input: string) => sqlFiles(input).flatMap(scan));
hits.sort((a: Hit, b: Hit) => a.file.localeCompare(b.file) || a.line - b.line);

const markdown = render(hits, inputs);

if (outFile) {
  writeFileSync(outFile, `${markdown}\n`);
  console.error(`${hits.length} occurrences written to ${outFile}`);
} else {
  console.log(markdown);
}

const unknown = hits.filter((h: Hit) => h.suggestion === "UNKNOWN").length;
if (unknown > 0) {
  console.error(`\n${unknown} occurrences nothing could classify. Those are the ones to read.`);
}
