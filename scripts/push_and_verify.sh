#!/usr/bin/env bash
# push_and_verify.sh — push the Gallery AND prove it actually landed end-to-end:
# (1) the commit reached the GitHub remote, and (2) Cloudflare Pages actually
# DEPLOYED it to the live site. Re-does whatever step failed until it lands.
#
# WHY THIS EXISTS (Tim 2026-06-04): a `git push` can report success-ish yet the
# change is NOT live — the pre-push scorecard can abort it, a ref race can reject
# it, or (the silent one) GitHub accepts the commit but the Cloudflare build lags,
# queues behind other pushes, or fails, so game-factory.tech keeps serving the old
# build. "Pushed" != "live". This polls the LIVE site for a marker that only the
# new deploy contains and retries until it appears, so a deploy never silently
# fails to land.
#
# IMPORTANT: always curl with -L. Game pages 308-redirect (/games/<slug>/index.html
# -> /games/<slug>/); without -L you read an EMPTY redirect body and every check
# falsely reports "not landed" (the 2026-06-04 false alarm). Byte-hash compares are
# unreliable too — Cloudflare injects ~1KB (analytics/NEL) — so we grep for a marker.
#
# Usage:
#   bash push_and_verify.sh --url games/bolus/ --marker CULTURE_DEFS
#   bash push_and_verify.sh --url games/bolus/ --marker CULTURE_DEFS --push
#   bash push_and_verify.sh --url games/bolus/ --marker CULTURE_DEFS --retrigger
#
# Flags:
#   --url <path>         path under the site to poll (follow redirects), e.g. games/bolus/
#   --marker <pattern>   grep -E pattern that ONLY the new deploy contains (e.g. a new
#                        function/string). Its presence on the live page == deploy landed.
#   --push               run `git push` (through the gate, rebase-on-race) before verifying.
#   --retrigger          if the deploy hasn't propagated by the deadline, push an empty
#                        commit to kick a fresh Cloudflare build, then keep polling.
#   --timeout-min N      max minutes to wait per deploy attempt (default 8).
#   --push-retries N     max push attempts on ref-race (default 3).
#   --site URL           default https://game-factory.tech
#
# Exit 0 = committed AND live. Non-zero = could not get it live (caller should alert).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"      # Gallery/
SITE="https://game-factory.tech"
URLPATH="" MARKER="" DO_PUSH=0 RETRIGGER=0 TIMEOUT_MIN=8 PUSH_RETRIES=3
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)          URLPATH="$2"; shift 2 ;;
    --marker)       MARKER="$2"; shift 2 ;;
    --push)         DO_PUSH=1; shift ;;
    --retrigger)    RETRIGGER=1; shift ;;
    --timeout-min)  TIMEOUT_MIN="$2"; shift 2 ;;
    --push-retries) PUSH_RETRIES="$2"; shift 2 ;;
    --site)         SITE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
cd "$ROOT"
log() { echo "[push_and_verify] $*"; }

# ── Phase 1: ensure HEAD is on the remote ────────────────────────────────────
ensure_pushed() {
  local n=0
  while (( n < PUSH_RETRIES )); do
    git fetch origin main -q 2>/dev/null
    [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] && { log "remote == HEAD ($(git rev-parse --short HEAD))"; return 0; }
    n=$((n+1)); log "push attempt $n/$PUSH_RETRIES ..."
    git push 2>&1 | tail -3 || true
    git fetch origin main -q 2>/dev/null
    [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] && { log "push landed on remote"; return 0; }
    if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
      log "remote advanced — rebasing onto origin/main"
      git pull --rebase origin main -q 2>&1 | tail -2 || { log "rebase conflict — manual fix needed"; return 1; }
    else
      log "push refused (likely scorecard gate). Fix findings or re-run once it passes."; return 1
    fi
  done
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]]
}

if (( DO_PUSH )); then ensure_pushed || { log "PUSH did not land"; exit 1; }
else git fetch origin main -q 2>/dev/null; fi

# ── Phase 2: prove the LIVE site serves the new deploy ───────────────────────
if [[ -z "$URLPATH" || -z "$MARKER" ]]; then
  log "no --url/--marker; verified push only. (Pass --url <path> --marker <pat> to verify the live deploy.)"; exit 0
fi
log "polling $SITE/$URLPATH for marker /$MARKER/ (deploy-landed signal)"
deadline=$(( $(date +%s) + TIMEOUT_MIN*60 ))
retriggered=0
while :; do
  # Capture then grep: pipefail + grep -q can SIGPIPE curl after an early match,
  # which makes a found marker report as stale on large HTML pages.
  body="$(curl -sL --max-time 15 "$SITE/$URLPATH?cb=$RANDOM$(date +%s)" || true)"
  if grep -qE "$MARKER" <<<"$body"; then
    log "✅ DEPLOY LANDED — live $URLPATH contains /$MARKER/."; exit 0
  fi
  now=$(date +%s)
  if (( now >= deadline )); then
    if (( RETRIGGER && !retriggered )); then
      log "deploy still stale after ${TIMEOUT_MIN}m — empty commit to re-trigger Cloudflare"
      git commit --allow-empty -q -m "chore(deploy): re-trigger Cloudflare build (deploy did not land)" || true
      ensure_pushed || { log "re-trigger push failed"; exit 1; }
      retriggered=1; deadline=$(( now + TIMEOUT_MIN*60 )); continue
    fi
    log "❌ DEPLOY DID NOT LAND within ${TIMEOUT_MIN}m. Live $URLPATH lacks /$MARKER/."
    log "   CF build likely queued or failed — check the CF Pages dashboard / re-run with --retrigger."
    exit 1
  fi
  log "not live yet — waiting 15s ..."
  sleep 15
done
