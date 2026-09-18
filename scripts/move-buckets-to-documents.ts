// Copy the stored originals into a single `documents` bucket.
//
//   npx tsx scripts/move-buckets-to-documents.ts            # dry run, writes nothing
//   npx tsx scripts/move-buckets-to-documents.ts --commit   # do it
//
// Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL from .env.
//
// WHY A COPY. Supabase has no rename for a bucket, and an object is addressed by its bucket id,
// so the only way across is object by object, server side.
//
// StäyHub keeps its originals in TWO buckets, which MAYESTATE did not have to deal with:
//   receipts      what the pipeline writes
//   belege-files  what the Hub's own upload screen wrote
// Both go to `documents`. `outgoing-invoice-files` and `profile-pictures` stay where they are.
//
// THE OBJECT LIST COMES FROM THE DATABASE, not from the Storage API. Storage lists one folder at
// a time, and the pipeline writes under receipts/pleo/<month>/<uuid>/, so walking it meant
// thousands of round trips: a first attempt ran seven minutes without finishing and fell over on
// a 502. `storage.objects` answers the same question in one query, and it is the same table the
// API reads.
//
// Safe to run again: an object already on the other side is skipped, and NOTHING IS DELETED. The
// old buckets stay until the Hub has been seen working against the new one, because deleting them
// is the one irreversible step here.
//
// Afterwards, four things have to follow the bytes, and each one breaks something on its own:
//   1. document_files.storage_bucket          migration 20260916140000
//   2. the storage policies                    migration 20260916140000
//   3. archive_bucket in book-keeping config/tenants/staeyhub.json, by hand in that repo
//   4. BUCKET in supabase/functions/pleo-receipts/index.ts, then redeploy that function
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FROM = ["receipts", "belege-files"];
const TO = "documents";
const PAGE = 100;

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const commit = process.argv.includes("--commit");

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both needed in .env.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Retry a Storage call that failed for a reason worth retrying.
 *
 * Walking thousands of objects means thousands of API calls, and Storage returns the occasional
 * 502. A dry run over `receipts` hit "Bad Gateway" partway through. Without this, a transient
 * blip a thousand objects into a copy throws the whole run away.
 */
async function withRetry<T>(what: string, call: () => Promise<{ data: T; error: unknown }>) {
  let wait = 500;
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await call();
    if (!error) return data;
    const said = (error as { message?: string }).message ?? String(error);
    const worthRetrying =
      /bad gateway|gateway time|502|503|504|fetch failed|socket|ECONNRESET|timeout/i.test(said);
    if (!worthRetrying || attempt >= 6) throw new Error(`${what}: ${said}`);
    console.log(`  ${what}: ${said}. retrying in ${wait}ms (attempt ${attempt} of 5)`);
    await sleep(wait);
    wait *= 2;
  }
}

/**
 * Every object in these buckets, straight from storage.objects. One query, no paging.
 *
 * The connection is handed to psql through PG* environment variables rather than as a URL
 * argument. A URL in argv shows up in `ps` and, worse, in the text of any error the child
 * process throws, which is how the database password ended up on screen the first time.
 */
function objectsIn(buckets: string[]): Map<string, string[]> {
  const dsn = new URL(process.env.DATABASE_URL as string);
  const env = {
    ...process.env,
    PGHOST: dsn.hostname,
    PGPORT: dsn.port || "5432",
    PGUSER: decodeURIComponent(dsn.username),
    PGPASSWORD: decodeURIComponent(dsn.password),
    PGDATABASE: dsn.pathname.replace(/^\//, "") || "postgres",
  };
  const list = buckets.map((b) => `'${b}'`).join(", ");
  let out: string;
  try {
    out = execFileSync(
      "psql",
      [
        "--no-psqlrc",
        "-qAt",
        "-c",
        `select bucket_id || chr(9) || name from storage.objects ` +
          `where bucket_id in (${list}) order by bucket_id, name`,
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env },
    );
  } catch (error) {
    // Never let the child's message through unscrubbed: it can carry the connection details.
    const said = error instanceof Error ? error.message : String(error);
    throw new Error(
      `reading storage.objects failed: ${said.replace(/postgres(ql)?:\/\/\S+/g, "<dsn>")}`,
    );
  }

  const found = new Map<string, string[]>();
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    const bucket = line.slice(0, tab);
    if (!found.has(bucket)) found.set(bucket, []);
    found.get(bucket)?.push(line.slice(tab + 1));
  }
  return found;
}

async function main() {
  const buckets = await sb.storage.listBuckets();
  if (buckets.error) throw new Error(`listing buckets: ${buckets.error.message}`);
  const names = new Set((buckets.data ?? []).map((one) => one.name));

  const sources = FROM.filter((b) => names.has(b));
  if (sources.length === 0) {
    console.error(`None of ${FROM.join(", ")} is here. Nothing to do.`);
    process.exit(1);
  }

  const byBucket = objectsIn(sources);
  for (const bucket of sources) if (!byBucket.has(bucket)) byBucket.set(bucket, []);

  // A path in two source buckets would land on itself. Stop rather than pick a winner.
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const [bucket, paths] of byBucket) {
    for (const path of paths) {
      const first = seen.get(path);
      if (first) clashes.push(`${path}  (in ${first} and ${bucket})`);
      else seen.set(path, bucket);
    }
  }
  if (clashes.length > 0) {
    console.error(`${clashes.length} path(s) exist in more than one source bucket:`);
    for (const c of clashes.slice(0, 20)) console.error(`  ${c}`);
    console.error("\nResolve these by hand first. Nothing was written.");
    process.exit(1);
  }

  const already = new Set(objectsIn([TO]).get(TO) ?? []);
  const work: Array<{ from: string; path: string }> = [];
  for (const [bucket, paths] of byBucket) {
    for (const path of paths) if (!already.has(path)) work.push({ from: bucket, path });
  }

  for (const [bucket, paths] of byBucket) console.log(`${bucket}: ${paths.length} object(s)`);
  console.log(`${TO}: ${already.size} already there, ${work.length} to copy`);

  if (!commit) {
    for (const one of work.slice(0, 20)) console.log(`  would copy ${one.from}/${one.path}`);
    if (work.length > 20) console.log(`  ... and ${work.length - 20} more`);
    console.log("\nNothing was written. Run again with --commit.");
    return;
  }

  if (!names.has(TO)) {
    const made = await sb.storage.createBucket(TO, { public: false });
    if (made.error) throw new Error(`creating ${TO}: ${made.error.message}`);
    console.log(`created bucket ${TO} (private)`);
  }

  let copied = 0;
  const failed: Array<{ path: string; said: string }> = [];
  for (const one of work) {
    try {
      await withRetry(`copying ${one.from}/${one.path}`, () =>
        sb.storage.from(one.from).copy(one.path, one.path, { destinationBucket: TO }),
      );
      copied += 1;
    } catch (error) {
      failed.push({
        path: `${one.from}/${one.path}`,
        said: error instanceof Error ? error.message : String(error),
      });
    }
    if ((copied + failed.length) % 100 === 0) {
      console.log(`  ${copied + failed.length}/${work.length}`);
    }
  }

  const landed = objectsIn([TO]).get(TO) ?? [];
  const expected = [...byBucket.values()].reduce((n, paths) => n + paths.length, 0);
  console.log(`\ncopied ${copied}, failed ${failed.length}`);
  console.log(`${TO} now holds ${landed.length} object(s); the sources hold ${expected}`);
  for (const one of failed) console.log(`  FAILED ${one.path}: ${one.said}`);

  if (failed.length > 0 || landed.length < expected) {
    console.error("\nNot every object arrived. Do not delete the old buckets; run this again.");
    process.exit(1);
  }
  console.log(`\nEvery object is in "${TO}". Now apply migration 20260916140000, point`);
  console.log(`config/tenants/staeyhub.json at it, redeploy pleo-receipts, and only then`);
  console.log(`delete the old buckets by hand.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
