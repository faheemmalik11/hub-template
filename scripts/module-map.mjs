// What each module is made of: its routes, the files only it uses, its tables and its RPCs.
//
//   node scripts/module-map.mjs            human-readable
//   node scripts/module-map.mjs --json     the same as data
//
// Written for porting. A module's skill quotes these numbers, so re-run it after moving files and
// the skill can be corrected against the code instead of trusted.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const SRC = "src";

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

const allFiles = walk(SRC);

function resolveImport(spec, fromFile) {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(fromFile), spec)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// `src/data/index.ts` re-exports all eighteen domains, so following it would make every module
// depend on every domain. Named imports are matched to the domain that defines them instead.
const BARREL = join(SRC, "data", "index.ts");

const definedIn = new Map();
for (const file of allFiles) {
  if (!file.startsWith(join(SRC, "data") + "/") || file === BARREL) continue;
  for (const match of readFileSync(file, "utf8").matchAll(
    /export\s+(?:async\s+)?(?:function|const|type|interface|class)\s+(\w+)/g,
  )) {
    if (!definedIn.has(match[1])) definedIn.set(match[1], file);
  }
}

function barrelTargets(source) {
  const targets = new Set();
  for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"@\/data"/g)) {
    for (const name of match[1].split(",")) {
      const bare = name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      const file = definedIn.get(bare);
      if (file) targets.add(file);
    }
  }
  return targets;
}

const importsOf = new Map();
for (const file of allFiles) {
  const source = readFileSync(file, "utf8");
  const targets = new Set();
  for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
    const resolved = resolveImport(match[1], file);
    if (resolved && resolved !== BARREL) targets.add(resolved);
  }
  for (const target of barrelTargets(source)) targets.add(target);
  importsOf.set(file, targets);
}

function reachableFrom(entries) {
  const seen = new Set(entries);
  const queue = [...entries];
  while (queue.length) {
    for (const next of importsOf.get(queue.pop()) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const routesSource = readFileSync("src/config/routes.ts", "utf8");
const routes = [...routesSource.matchAll(
  /path:\s*"([^"]+)",\s*labelKey:\s*"([^"]+)",\s*key:\s*PERMISSIONS\.(\w+),\s*module:\s*PERMISSIONS\.(\w+)/g,
)].map(([, path, labelKey, key, module]) => ({ path, labelKey, key, module }));

const permissionsSource = readFileSync("src/config/permissions.ts", "utf8");
const permissionKey = Object.fromEntries(
  [...permissionsSource.matchAll(/(\w+):\s*"([\w.]+)"/g)].map(([, name, value]) => [name, value]),
);

function entryFilesFor(path) {
  const slug = path === "/" ? "index" : path.replace(/^\//, "");
  const asDirectory = join(SRC, "routes", slug);
  if (existsSync(asDirectory) && statSync(asDirectory).isDirectory()) {
    return readdirSync(asDirectory)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => join(asDirectory, name));
  }
  for (const candidate of [`${asDirectory}.tsx`, `${asDirectory}.ts`]) {
    if (existsSync(candidate)) return [candidate];
  }
  return [];
}

const modules = new Map();
for (const route of routes) {
  const files = entryFilesFor(route.path);
  if (!modules.has(route.module)) modules.set(route.module, { routes: [], entries: [] });
  const module = modules.get(route.module);
  module.routes.push({ ...route, featureKey: permissionKey[route.key], files });
  module.entries.push(...files);
}

for (const [name, module] of modules) {
  module.key = permissionKey[name] ?? name;
  module.reachable = reachableFrom(module.entries);
}

for (const [name, module] of modules) {
  const elsewhere = new Set();
  for (const [otherName, other] of modules) {
    if (otherName !== name) for (const file of other.reachable) elsewhere.add(file);
  }
  module.own = [...module.reachable].filter((file) => !elsewhere.has(file)).sort();
  module.shared = [...module.reachable].filter((file) => elsewhere.has(file)).sort();
}

function factsFor(files) {
  const tables = new Set();
  const rpcs = new Set();
  const buckets = new Set();
  const edgeFunctions = new Set();
  const domains = new Set();
  const translationPrefixes = new Set();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\(\s*(?:TABLE\.(\w+)|"([a-z_0-9]+)")/g)) {
      tables.add(match[1] ? `TABLE.${match[1]}` : match[2]);
    }
    for (const match of source.matchAll(/\.rpc\(\s*(?:RPC\.(\w+)|"([a-z_0-9]+)")/g)) {
      rpcs.add(match[1] ? `RPC.${match[1]}` : match[2]);
    }
    for (const match of source.matchAll(/storage\s*\n?\s*\.from\(\s*(?:BUCKET\.(\w+)|"([a-z_0-9-]+)")/g)) {
      buckets.add(match[1] ?? match[2]);
    }
    for (const match of source.matchAll(/functions\.invoke\(\s*(?:EDGE_FUNCTION\.(\w+)|"([a-z_0-9-]+)")/g)) {
      edgeFunctions.add(match[1] ?? match[2]);
    }
    const domain = file.match(/^src\/data\/([a-z-]+)\//);
    if (domain) domains.add(domain[1]);
    const legacy = file.match(/^src\/lib\/data\/([a-z-]+)\.ts$/);
    if (legacy) domains.add(`lib/${legacy[1]}`);
    for (const match of source.matchAll(/\bt\(\s*"([a-zA-Z]+)\./g)) translationPrefixes.add(match[1]);
  }
  return {
    tables: [...tables].sort(),
    rpcs: [...rpcs].sort(),
    buckets: [...buckets].sort(),
    edgeFunctions: [...edgeFunctions].sort(),
    domains: [...domains].sort(),
    translationPrefixes: [...translationPrefixes].sort(),
  };
}

// The facts come from the files this module alone owns, plus the data files those reach directly.
// Following the whole closure would drag in the sidebar and with it every table in the app.
for (const [, module] of modules) {
  const scope = new Set(module.own);
  const queue = [...module.own];
  while (queue.length) {
    for (const next of importsOf.get(queue.pop()) ?? []) {
      const isDataFile =
        next.startsWith(join(SRC, "data") + "/") || next.startsWith(join(SRC, "lib", "data") + "/");
      if (isDataFile && !scope.has(next)) {
        scope.add(next);
        queue.push(next);
      }
    }
  }
  module.scope = scope;
}

const report = [...modules].map(([name, module]) => ({
  name,
  key: module.key,
  routes: module.routes.map((route) => ({
    path: route.path,
    featureKey: route.featureKey,
    labelKey: route.labelKey,
    files: route.files,
  })),
  ownFiles: module.own,
  sharedFileCount: module.shared.length,
  ...factsFor(module.scope),
}));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const module of report) {
    console.log(`\n=== ${module.key}  (${module.routes.length} routes, ${module.ownFiles.length} files of its own, ${module.sharedFileCount} shared)`);
    for (const route of module.routes) console.log(`  ${route.path.padEnd(24)} ${route.featureKey}`);
    console.log(`  data:    ${module.domains.join(", ") || "none"}`);
    console.log(`  tables:  ${module.tables.join(", ") || "none"}`);
    console.log(`  rpcs:    ${module.rpcs.join(", ") || "none"}`);
    if (module.buckets.length) console.log(`  buckets: ${module.buckets.join(", ")}`);
    if (module.edgeFunctions.length) console.log(`  edge:    ${module.edgeFunctions.join(", ")}`);
  }
  console.log("");
}
