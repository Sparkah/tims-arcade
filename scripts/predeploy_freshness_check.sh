#!/usr/bin/env bash
# Refuse to deploy a tims-arcade production tree that lags what is already live.
#
# Direct-upload Pages deploys replace the WHOLE tree, so a worktree that
# predates another session's fix silently reverts it (2026-07-21: the /cplay
# deploy reverted the dissertation universal-fit shell 34 minutes after it
# shipped). Run this from the deploying checkout BEFORE `wrangler pages deploy`.
#
# Usage: bash scripts/predeploy_freshness_check.sh [project-name]
set -euo pipefail

PROJECT="${1:-tims-arcade}"

live=$(npx wrangler pages deployment list --project-name="$PROJECT" 2>/dev/null \
  | awk -F'│' '/Production/ { gsub(/ /, "", $5); print $5; exit }')

if [ -z "$live" ]; then
  echo "predeploy: could not read the live production Source commit; refusing to guess." >&2
  echo "predeploy: run 'npx wrangler pages deployment list --project-name=$PROJECT' and check auth." >&2
  exit 1
fi

if ! git cat-file -e "$live^{commit}" 2>/dev/null; then
  echo "predeploy: live production commit $live is unknown in this checkout." >&2
  echo "predeploy: 'git fetch origin' first, then re-run; if still unknown, another session deployed unpushed work - find its checkout before deploying." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$live" HEAD; then
  echo "predeploy: DEPLOY BLOCKED - production is at $live, which is NOT an ancestor of HEAD $(git rev-parse --short HEAD)." >&2
  echo "predeploy: another session shipped work this tree lacks; merge that commit (usually origin/main) and deploy the superset." >&2
  exit 1
fi

echo "predeploy: OK - live commit $live is contained in HEAD $(git rev-parse --short HEAD)."
