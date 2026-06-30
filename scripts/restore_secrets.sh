#!/usr/bin/env bash
# Idempotent re-application of public CF Pages config secrets.
#
# Reason: secrets configured via `wrangler pages secret put` have been
# observed to disappear during git-triggered rebuilds (esp. when the
# wrangler.toml [vars] block is empty). The rest of the project's
# functions then silently degrade — /posthog-init drops to its no-op
# stub, /api/counts may 500, etc.
#
# This script applies public client config from the caller's environment.
# It does NOT touch truly secret values (ADMIN_TOKEN, AUTH_SECRET,
# AUTH_DEV_MODE) -- those persist correctly and live only in CF dashboard
# / local env files.
#
# Run this:
#   - Manually after any "site looks broken" incident
#   - Auto-invoked by smoke_test.sh on /posthog-init failure
#   - Once at the start of run_factory.sh as belt-and-braces
#
# Usage:
#   PUBLIC_POSTHOG_KEY=... bash Gallery/scripts/restore_secrets.sh

set -euo pipefail

PROJECT="${PROJECT:-tims-arcade}"
PUBLIC_POSTHOG_HOST="${PUBLIC_POSTHOG_HOST:-https://eu.i.posthog.com}"
export PUBLIC_POSTHOG_HOST

if [[ -z "${PUBLIC_POSTHOG_KEY:-}" ]]; then
  echo "restore_secrets: PUBLIC_POSTHOG_KEY must be provided in the environment" >&2
  exit 2
fi
if [[ "$PUBLIC_POSTHOG_HOST" != https://* ]]; then
  echo "restore_secrets: PUBLIC_POSTHOG_HOST must be an https:// URL" >&2
  exit 2
fi

PAYLOAD="$(node -e 'process.stdout.write(JSON.stringify({
  PUBLIC_POSTHOG_KEY: process.env.PUBLIC_POSTHOG_KEY,
  PUBLIC_POSTHOG_HOST: process.env.PUBLIC_POSTHOG_HOST
}, null, 2))')"

echo "▶ restoring CF Pages public secrets for $PROJECT..."
echo "$PAYLOAD" | wrangler pages secret bulk --project-name="$PROJECT" 2>&1 \
  | grep -E "✨|Creating|secrets successfully|error" || true
echo "✓ restore_secrets done"
