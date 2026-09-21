// Renames German identifiers to English, using TypeScript's own parser to find them.
//
//   node scripts/rename-german.mjs --dry     what would change
//   node scripts/rename-german.mjs           change it
//
// Only Identifier tokens are touched. Strings, template text, comments, regex literals and
// snake_case (which is a database column, not a name somebody chose) are left exactly as they are.
// A hand-rolled scanner got this wrong on regex literals containing a quote, silently skipping the
// rest of the file, so the parser does the lexing here.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const GLOSSARY = JSON.parse(readFileSync(new URL("./german-glossary.json", import.meta.url)));
const RESERVED = new Set(["new", "class", "function", "return", "delete", "default", "case",
  "switch", "for", "if", "else", "import", "export", "const", "let", "var", "this", "typeof"]);
// Keys of the jsonb a row already carries (document_history.data, change_history.data), not names.
const STORED_IN_A_ROW = new Set(["vorher", "nachher", "von", "nach", "grund", "kommentar"]);
const SHADOWS_A_GLOBAL = { document: "doc", history: "historyEntries", location: "place",
  status: "state", name: "label", event: "evt", screen: "display", top: "first", self: "own" };

function translate(name, isPropertyName) {
  if (isPropertyName && STORED_IN_A_ROW.has(name)) return name;
  if (name.includes("-")) return name;
  if (name.includes("_") && name !== name.toUpperCase()) return name;
  const segments = name.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+|_/g);
  if (!segments) return name;
  let changed = false;
  const out = segments.map((segment) => {
    if (segment === "_") return segment;
    const replacement = GLOSSARY[segment.toLowerCase()];
    if (!replacement || replacement === segment.toLowerCase()) return segment;
    changed = true;
    if (segment === segment.toUpperCase() && segment.length > 1) return replacement.toUpperCase();
    if (segment[0] === segment[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
  if (!changed) return name;
  let rebuilt = name.includes("_")
    ? out.join("")
    : out.map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1))).join("");
  rebuilt = (name[0] === name[0].toUpperCase() ? rebuilt[0].toUpperCase() : rebuilt[0].toLowerCase())
    + rebuilt.slice(1);
  if (RESERVED.has(rebuilt) && !isPropertyName) return name;
  if (SHADOWS_A_GLOBAL[rebuilt] && !isPropertyName) return SHADOWS_A_GLOBAL[rebuilt];
  return rebuilt;
}

function namesAProperty(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isJsxAttribute(parent)) return parent.name === node;
  if (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent)
      || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isEnumMember(parent)) {
    return parent.name === node;
  }
  return false;
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === "locales") return [];
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) && entry !== "routeTree.gen.ts" ? [path] : [];
  });
}

const dryRun = process.argv.includes("--dry");
let touchedFiles = 0;
let renames = 0;

for (const path of walk("src")) {
  const source = readFileSync(path, "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const edits = [];
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const translated = translate(node.text, namesAProperty(node));
      if (translated !== node.text) {
        edits.push({ start: node.getStart(tree), end: node.getEnd(), text: translated });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);

  if (!edits.length) continue;
  touchedFiles += 1;
  renames += edits.length;
  if (dryRun) continue;

  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  writeFileSync(path, out);
}

console.log(`${renames} identifiers in ${touchedFiles} files${dryRun ? " (dry run)" : ""}`);
