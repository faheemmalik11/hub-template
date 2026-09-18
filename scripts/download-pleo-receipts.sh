#!/usr/bin/env bash
# Download all outstanding Pleo receipt files into Supabase Storage.
#
# The edge function processes a bounded batch per call (an Edge Function has a wall-clock limit,
# so ~2,000 downloads cannot run in one invocation). This loops until nothing is left.
#
# Safe to stop and restart at any point: each call only picks up receipts that are not stored
# yet, and re-running never duplicates a file.
#
#   ./scripts/download-pleo-receipts.sh          # batch of 50
#   ./scripts/download-pleo-receipts.sh 100      # bigger batches

set -uo pipefail
cd "$(dirname "$0")/.."

BATCH="${1:-50}"
set -a; source .env; set +a
URL="https://xsgbdtdwhrrhoeximeon.supabase.co/functions/v1/pleo-receipts?batch=${BATCH}"

echo "Downloading Pleo receipts (batch=${BATCH}). Ctrl-C to stop — progress is kept."
total_files=0
stall=0

while :; do
  resp=$(curl -s --max-time 600 -X POST "$URL" \
    -H "Authorization: Bearer ${VITE_SUPABASE_PUBLISHABLE_KEY}" \
    -H "x-sync-secret: ${SYNC_SECRET}")

  if [ -z "$resp" ]; then
    echo "  no response — retrying in 10s"; sleep 10; continue
  fi

  read -r downloaded failed remaining <<<"$(printf '%s' "$resp" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    print("0 0 -1"); raise SystemExit
print(d.get("downloaded",0), d.get("failed",0), d.get("remaining",-1))')"

  if [ "$remaining" = "-1" ]; then
    echo "  unexpected response: ${resp:0:200}"; sleep 10; continue
  fi

  total_files=$((total_files + downloaded))
  printf '  +%-4s downloaded   failed:%-4s remaining:%-6s (session total: %s)\n' \
    "$downloaded" "$failed" "$remaining" "$total_files"

  [ "$remaining" -le 0 ] && { echo "Done — all receipts stored."; break; }

  # Nothing moved: everything left is unreachable (deleted in Pleo, or a persistent error).
  # Stop rather than spin forever.
  if [ "$downloaded" -eq 0 ]; then
    stall=$((stall + 1))
    if [ "$stall" -ge 3 ]; then
      echo "No progress in 3 consecutive batches — ${remaining} receipts could not be fetched. Stopping."
      echo "Check:  select * from bank_sync_logs where event like 'receipts%' order by created_at desc limit 5;"
      break
    fi
  else
    stall=0
  fi
done
