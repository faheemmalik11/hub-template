#!/usr/bin/env bash
# Push a client's branch of this repo to that client's own standalone repo, as well as to this
# repo's own origin. The mapping (which branch in this repo, which remote, which URL, which
# branch on their side, and whether mirroring is even on) lives in scripts/client-repos.json, not
# in this script, so a new client is a new JSON entry, not a new script or a hardcoded remote on
# one developer's machine.
#
#   ./scripts/push-client-repo.sh van-oepen
#
# The argument is the client's key in the config, not necessarily the branch name itself — the
# config's own "hubTemplateBranch" field says which branch of this repo actually gets pushed.
#
# "enabled": false for a client pushes to origin only and skips their repo, same as if they had no
# entry at all except it stays documented in the config. Off by default for a new entry, same as
# any other new behaviour in this repo.
#
# Safe to run from any machine: it adds the client's remote if missing, using the URL from the
# config file, then pushes. Does nothing destructive — a normal push, nothing force, nothing else
# touched.

set -euo pipefail
cd "$(dirname "$0")/.."

CLIENT_KEY="${1:-}"
if [ -z "$CLIENT_KEY" ]; then
  echo "Usage: $0 <client-key>" >&2
  echo "Known clients in scripts/client-repos.json:" >&2
  node -e "console.error(Object.keys(require('./scripts/client-repos.json')).map((k) => '  ' + k).join('\n'))"
  exit 1
fi

CLIENT_CONFIG_JSON=$(node -e "
const config = require('./scripts/client-repos.json');
const entry = config['$CLIENT_KEY'];
if (!entry) {
  console.error('No entry for \"$CLIENT_KEY\" in scripts/client-repos.json');
  process.exit(1);
}
console.log(JSON.stringify(entry));
")

HUB_TEMPLATE_BRANCH=$(node -e "console.log(JSON.parse(process.argv[1]).hubTemplateBranch)" "$CLIENT_CONFIG_JSON")
MIRROR_ENABLED=$(node -e "console.log(JSON.parse(process.argv[1]).enabled === true ? 'true' : 'false')" "$CLIENT_CONFIG_JSON")
CLIENT_REMOTE_NAME=$(node -e "console.log(JSON.parse(process.argv[1]).clientRemoteName)" "$CLIENT_CONFIG_JSON")
CLIENT_REMOTE_URL=$(node -e "console.log(JSON.parse(process.argv[1]).clientRemoteUrl)" "$CLIENT_CONFIG_JSON")
CLIENT_REMOTE_BRANCH=$(node -e "console.log(JSON.parse(process.argv[1]).clientRemoteBranch)" "$CLIENT_CONFIG_JSON")

if ! git show-ref --verify --quiet "refs/heads/$HUB_TEMPLATE_BRANCH"; then
  echo "No local branch named '$HUB_TEMPLATE_BRANCH' (from the \"hubTemplateBranch\" field for '$CLIENT_KEY')." >&2
  exit 1
fi

if [ "$MIRROR_ENABLED" != "true" ]; then
  echo "Mirroring '$CLIENT_KEY' to their own repo is off (\"enabled\": false in scripts/client-repos.json)."
  echo "Pushing $HUB_TEMPLATE_BRANCH to origin only..."
  git push origin "$HUB_TEMPLATE_BRANCH"
  echo "Done. Set \"enabled\": true for '$CLIENT_KEY' in scripts/client-repos.json to also mirror to their own repo."
  exit 0
fi

if git remote get-url "$CLIENT_REMOTE_NAME" >/dev/null 2>&1; then
  EXISTING_CLIENT_REMOTE_URL=$(git remote get-url "$CLIENT_REMOTE_NAME")
  if [ "$EXISTING_CLIENT_REMOTE_URL" != "$CLIENT_REMOTE_URL" ]; then
    echo "Remote '$CLIENT_REMOTE_NAME' exists but points at $EXISTING_CLIENT_REMOTE_URL, not $CLIENT_REMOTE_URL (per the config). Not changing it automatically." >&2
    exit 1
  fi
else
  echo "Adding remote '$CLIENT_REMOTE_NAME' -> $CLIENT_REMOTE_URL"
  git remote add "$CLIENT_REMOTE_NAME" "$CLIENT_REMOTE_URL"
fi

echo "Pushing $HUB_TEMPLATE_BRANCH to origin..."
git push origin "$HUB_TEMPLATE_BRANCH"

echo "Pushing $HUB_TEMPLATE_BRANCH to $CLIENT_REMOTE_NAME:$CLIENT_REMOTE_BRANCH..."
git push "$CLIENT_REMOTE_NAME" "$HUB_TEMPLATE_BRANCH:$CLIENT_REMOTE_BRANCH"

echo "Done."
