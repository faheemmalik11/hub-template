#!/usr/bin/env bash
# Take the authoritative snapshot of the live Stäy Hub schema, for the table rename.
#
# WHY THIS EXISTS. Nothing in the repo can tell you what the database looks like:
#   - supabase/schema.sql is a German-era snapshot (belege, lieferanten) and predates 0019.
#   - src/integrations/supabase/types.ts is 17 KB and partial (CLAUDE.md wrongly calls it empty).
#   - supabase/migrations/ never creates the pipeline's own tables. There is no migration here
#     that creates channels, channel_folders, read_cursors or imported_messages, yet
#     config/tenants/staeyhub.json in book-keeping declares three channels.
# The rename migration, the column list and the classification pass are all generated from the
# file this script writes, and from nothing else.
#
# READ ONLY. Every statement below is a dump or a SELECT. Nothing writes to the database.
#
#   ./scripts/dump-live-schema.sh              # dump public + storage, write the counts baseline
#   ./scripts/dump-live-schema.sh --dry-run    # print the pg_dump the CLI would run, change nothing
#   ./scripts/dump-live-schema.sh --out DIR    # write somewhere other than the default
#
# Output lands under supabase/_backup/, which .gitignore already keeps out of the repo. The dump
# holds no rows, but it does hold every policy and function body, so treat it as private.

set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
OUT_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f .env ]; then
  echo "no .env in $(pwd). DATABASE_URL has to come from somewhere." >&2
  exit 1
fi
set -a; source .env; set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set in .env." >&2
  exit 1
fi

# The CLI runs pg_dump inside an image matching the server. The local pg_dump is 16 and the
# Supabase server is newer, so calling pg_dump directly fails on a server version mismatch.
if ! command -v supabase >/dev/null; then
  echo "the supabase CLI is not on PATH. Install it rather than reaching for the local pg_dump." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-supabase/_backup/rename-snapshot/$STAMP}"
mkdir -p "$OUT_DIR"

if [ "$DRY_RUN" = "1" ]; then
  echo "== the pg_dump that would run for schema public =="
  supabase db dump --db-url "$DATABASE_URL" --schema public --dry-run
  echo
  echo "== the pg_dump that would run for schema storage =="
  supabase db dump --db-url "$DATABASE_URL" --schema storage --dry-run
  exit 0
fi

echo "writing to $OUT_DIR"

# 1. The schema itself. `supabase db dump` is schema only unless told --data-only.
#    --keep-comments matters: a comment inside a function body is part of the body, and the
#    classification pass reads those bodies.
echo "  public.sql ..."
supabase db dump --db-url "$DATABASE_URL" --schema public --keep-comments -f "$OUT_DIR/public.sql"

# 2. The storage schema, for the bucket move. The two receipts_* policies name their bucket in
#    the predicate, so a bucket rename leaves the new one with no policy at all.
echo "  storage.sql ..."
supabase db dump --db-url "$DATABASE_URL" --schema storage --keep-comments -f "$OUT_DIR/storage.sql" || \
  echo "  (storage dump failed, not fatal: it only matters for the bucket move)"

# 3. The counts baseline. Section "Proof that nothing was lost" in the MAYESTATE write-up compares
#    these before and after, on two throwaway databases loaded from this same dump.
echo "  counts-before.txt ..."
psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align -f - > "$OUT_DIR/counts-before.txt" <<'SQL'
select 'functions', count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'triggers', count(*) from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
union all select 'rls_policies', count(*) from pg_policies where schemaname = 'public'
union all select 'foreign_keys', count(*) from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and c.contype = 'f'
union all select 'views', count(*) from pg_views where schemaname = 'public'
union all select 'tables', count(*) from pg_tables where schemaname = 'public'
order by 1;
SQL

# 4. The inventory: which tables exist, which carry a renamed column, which functions and views
#    name one, and whether a signature moves. This is the half of the classification pass that
#    the catalogue can answer on its own.
echo "  inventory.txt ..."
psql "$DATABASE_URL" --no-psqlrc --quiet -f scripts/one-off/2026-09-16-rename-inventory.sql \
  > "$OUT_DIR/inventory.txt"

# 5. A convenience pointer, so the classification pass and the generator do not each need the stamp.
ln -sfn "$STAMP" "supabase/_backup/rename-snapshot/latest"

echo
echo "done."
echo
echo "  counts baseline:"
sed 's/^/    /' "$OUT_DIR/counts-before.txt"
echo
echo "next:"
echo "  npx tsx scripts/classify-rename-strings.ts $OUT_DIR/public.sql"
echo "  less $OUT_DIR/inventory.txt"
