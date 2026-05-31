#!/usr/bin/env bash
# Gallery push lock - serialises commit+push to the Gallery repo across every
# agent + script on this machine, so concurrent pushes stop racing (sweeping
# each other's working tree into one commit, or colliding on the main ref).
#
# Why a lock and not just retries: the races seen 2026-05-30/31 were a second
# agent's `git commit` swallowing the first's uncommitted files, and two pushes
# fighting for refs/heads/main ("cannot lock ref"). A single machine-wide lock
# around the whole commit+push critical section is the fix.
#
# Mechanism: an atomic `mkdir` lockdir (mkdir either creates or fails - no TOCTOU)
# with an owner/slug/pid/token metadata file. NON-BLOCKING: acquire fails fast if
# held (callers defer/retry rather than hang). Stale locks (holder pid dead, or
# older than GF_PUSH_LOCK_STALE seconds) are broken automatically.
#
# Usage:
#   token=$(push_lock.sh acquire <owner> [<slug>])  # prints token + exit 0, or exit 1 if held
#   push_lock.sh release <token>                     # release iff token matches (or "" to force)
#   push_lock.sh holder                              # print current holder metadata, if any
#
# Callers that hold the lock across their own `git push` export
# GF_PUSH_LOCK_TOKEN=<token> so the pre-push hook recognises them and does not
# try to re-acquire (which would self-deadlock).

set -uo pipefail
ROOT="/Users/timmarkin/Agents"
LOCK_DIR="${GF_PUSH_LOCK_DIR:-$ROOT/Shared/data/locks/gallery-push.lock}"
META="$LOCK_DIR/meta"
LOG="$ROOT/Shared/data/locks/gallery-push.log"
STALE_SECS="${GF_PUSH_LOCK_STALE:-600}"   # 10 min - a real push (incl. AI scorecard) is well under this
mkdir -p "$(dirname "$LOCK_DIR")"

_now() { date +%s; }
_log() { echo "[$(date -Iseconds)] $*" >> "$LOG" 2>/dev/null || true; }
_meta_get() { sed -n "s/^$1=//p" "$META" 2>/dev/null | head -1; }

_write_meta() {
  local owner="$1" slug="$2" token="$3" pid="$4"
  printf 'owner=%s\nslug=%s\npid=%s\ntoken=%s\nat=%s\n' \
    "$owner" "$slug" "$pid" "$token" "$(date -Iseconds)" > "$META"
}

case "${1:-}" in
  acquire)
    owner="${2:-unknown}"; slug="${3:-}"; holder_pid="${4:-$PPID}"
    token="$$-$(_now)-$RANDOM"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      _write_meta "$owner" "$slug" "$token" "$holder_pid"
      _log "ACQUIRE owner=$owner slug=${slug:--} pid=$holder_pid token=$token"
      echo "$token"; exit 0
    fi
    # Held - decide stale vs live.
    h_pid="$(_meta_get pid)"; h_owner="$(_meta_get owner)"; h_slug="$(_meta_get slug)"
    h_mtime="$(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0)"
    age=$(( $(_now) - h_mtime ))
    dead=0
    if [[ -n "$h_pid" ]] && ! kill -0 "$h_pid" 2>/dev/null; then dead=1; fi
    if (( dead == 1 )) || (( age > STALE_SECS )); then
      # Atomically STEAL the stale lock: `mv` of the dir is atomic, so of several
      # racers only ONE can move THIS dir away - the losers' mv fails ("no such
      # file") and they fall through to DENY instead of all rm+mkdir-ing and
      # double-acquiring (the TOCTOU the old rm+mkdir had). The winner then mkdir's
      # a fresh lock (and still loses cleanly to any concurrent fresh acquirer).
      steal="${LOCK_DIR}.stale.$$.$RANDOM"
      if mv "$LOCK_DIR" "$steal" 2>/dev/null; then
        rm -rf "$steal" 2>/dev/null
        _log "BREAK-STALE held-by=$h_owner slug=${h_slug:--} pid=$h_pid dead=$dead age=${age}s -> $owner"
        if mkdir "$LOCK_DIR" 2>/dev/null; then
          _write_meta "$owner" "$slug" "$token" "$holder_pid"
          _log "ACQUIRE(after-stale) owner=$owner slug=${slug:--} pid=$holder_pid token=$token"
          echo "$token"; exit 0
        fi
      fi
    fi
    _log "DENIED owner=$owner slug=${slug:--} (held by $h_owner slug=${h_slug:--} pid=$h_pid age=${age}s)"
    exit 1
    ;;
  release)
    want="${2:-}"
    if [[ -d "$LOCK_DIR" ]]; then
      have="$(_meta_get token)"; h_owner="$(_meta_get owner)"
      if [[ -z "$want" || "$want" == "$have" ]]; then
        rm -rf "$LOCK_DIR"
        _log "RELEASE owner=$h_owner token=${want:-(force)}"
      else
        _log "RELEASE-SKIP token mismatch (have=$have want=$want) - not ours, leaving it"
      fi
    fi
    exit 0
    ;;
  holder)
    [[ -f "$META" ]] && cat "$META" || true
    exit 0
    ;;
  *)
    echo "usage: push_lock.sh acquire <owner> [slug] | release <token> | holder" >&2
    exit 2
    ;;
esac
