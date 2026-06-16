#!/usr/bin/env bash
# Stage 0.8 — KV LIST-op guard (pre-push).
#
# WHY: the FREE Cloudflare Workers KV tier caps LIST operations at 1000/day. We
# blew it TWICE in 24h with only ~100 DAU:
#   - 2026-06-15: the vibe-relay (24/7) polled /api/admin/gen-queue every 15s and
#     gen-queue did a `genjob:` LIST on every poll = ~5760 list ops/day.
#   - 2026-06-16: /api/counts did a 4-prefix LIST walk on nearly every page load.
# A single env.VOTES.list() on a per-request or polled code path is enough to
# exhaust the day. This gate BLOCKS a push that ADDS a new `.list(` to a
# functions/ file that has NO caching / signal / snapshot guard, so the trap
# can't ship silently again.
#
# Full guide + the fix patterns: Knowledge/Learnings/KV List Budget.md
# Bypass (only when you're certain the new list IS protected): git push --no-verify
#
# NOTE: macOS ships bash 3.2 — no mapfile/readarray. Keep this POSIX-ish.
set -uo pipefail

GALLERY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$GALLERY_DIR" || exit 0

# Range being pushed: prefer the merge-base with origin/main; fall back to last commit.
BASE="origin/main"
git rev-parse --verify -q "$BASE" >/dev/null 2>&1 || BASE="HEAD~1"
git rev-parse --verify -q "$BASE" >/dev/null 2>&1 || exit 0   # shallow / first commit — skip

changed="$(git diff --name-only "$BASE...HEAD" -- functions 2>/dev/null | grep -E '\.js$' || true)"
[ -z "$changed" ] && exit 0

# A file is GUARDED if it uses any of these protection patterns. This is a
# HEURISTIC stage-0 net (per-file, not per-hunk): it catches the UNGUARDED class
# (a brand-new endpoint / poller that lists with zero protection - e.g. the
# 2026-06-15 gen-queue), but NOT a "cached-but-still-expensive" list (e.g. counts,
# which had edgeCached yet still walked per-miss). The scorecard (stage 2) +
# Knowledge/Learnings/KV List Budget.md cover the subtler class.
#   edgeCached  - caches.default read wrapper (functions/_lib/edgecache.js)
#   snapshot    - serves a pre-built snapshot key instead of scanning (boot.js)
#   get('signal') - single-key poll signal so callers don't list (gen-queue/uploads);
#                   matched precisely (not bare "signal", which hits AbortSignal etc.)
#   checkRate   - per-IP cold-scan rate limit (leaderboard.js)
#   tailKey / readRoomTail - hot tail key; list is a cold fallback only (chat)
GUARD_RE="edgeCached|snapshot|checkRate|tailKey|readRoomTail|get\(['\"]signal"

offenders=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  added="$(git diff --unified=0 "$BASE...HEAD" -- "$f" | grep -E '^\+' | grep -vE '^\+\+\+' | grep -E '\.list[[:space:]]*\(' || true)"
  [ -z "$added" ] && continue
  grep -qE "$GUARD_RE" "$f" && continue   # has a cache/signal/snapshot/rate-limit guard
  offenders="$offenders $f"
done <<EOF
$changed
EOF

offenders="$(echo "$offenders" | xargs 2>/dev/null || true)"
[ -z "$offenders" ] && exit 0

{
  echo ""
  echo "🚫 KV LIST-op guard (stage 0.8): a NEW env.VOTES.list() was added to a"
  echo "   functions/ file with NO caching / signal / snapshot guard:"
  for f in $offenders; do echo "     - $f"; done
  echo ""
  echo "   The FREE Cloudflare KV tier caps LIST ops at 1000/day. A list() on a"
  echo "   per-request or polled path exhausts it (we hit the cap twice, 06-15/16)."
  echo "   FIX one of:"
  echo "     - Read endpoint  -> wrap in edgeCached()  (functions/_lib/edgecache.js)"
  echo "     - Poller         -> serve a single signal key (see admin/gen-queue.js ?signal=1)"
  echo "     - Derived counts -> read a snapshot/aggregate key, never scan (boot.js)"
  echo "   Guide: Knowledge/Learnings/KV List Budget.md"
  echo "   Bypass only if you're sure it's protected: git push --no-verify"
  echo ""
} >&2
exit 1
