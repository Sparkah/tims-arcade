#!/usr/bin/env bash
# Idempotent re-application of public CF Pages secrets.
#
# Reason: secrets configured via `wrangler pages secret put` have been
# observed to disappear during git-triggered rebuilds (esp. when the
# wrangler.toml [vars] block is empty). The rest of the project's
# functions then silently degrade — /posthog-init drops to its no-op
# stub, /api/counts may 500, etc.
#
# This script applies a known-good set of public client tokens that are
# explicitly safe to expose per their issuer's docs. It does NOT touch
# the truly-secret values (ADMIN_TOKEN, AUTH_SECRET, AUTH_DEV_MODE) —
# those persist correctly and live only in CF dashboard / .env.
#
# Run this:
#   - Manually after any "site looks broken" incident
#   - Auto-invoked by smoke_test.sh on /posthog-init failure
#   - Once at the start of run_factory.sh as belt-and-braces
#
# Usage:  bash Gallery/scripts/restore_secrets.sh

set -euo pipefail

PROJECT="tims-arcade"

# Public client tokens — safe to keep in source. PostHog's project token is
# documented as "write-only, safe to use in public apps". The host is the
# regional ingest endpoint.
read -r -d '' PAYLOAD <<'EOF' || true
{
  "PUBLIC_POSTHOG_KEY": "phc_u4gRcGzmTJ6Yzu6AERFd3QX8Jh6mJDUEGxQHytAMm4bP",
  "PUBLIC_POSTHOG_HOST": "https://eu.i.posthog.com"
}
EOF

echo "▶ restoring CF Pages public secrets for $PROJECT..."
echo "$PAYLOAD" | wrangler pages secret bulk --project-name="$PROJECT" 2>&1 \
  | grep -E "✨|Creating|secrets successfully|error" || true
echo "✓ restore_secrets done"
