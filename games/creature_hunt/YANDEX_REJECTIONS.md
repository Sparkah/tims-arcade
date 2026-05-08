# Yandex Moderation Log — Creature Hunt

Track every Yandex moderation outcome here. Pre-submit checks read this file and
verify each past failure pattern is no longer present.

Format per entry: date, version submitted, outcome, root cause, fix, file:line.

---

## Pre-submission fixes (no rejection yet, but caught proactively)

### 2026-05-05 — Debug error overlays stripped
- **Risk:** `_showGameError()` and `window.onerror` painted a red `rgba(200,0,0,0.9)`
  bar with raw exception text on any runtime error. A moderator hitting any edge
  case would see this as a "broken UI" and likely reject under §1.x (interface
  quality).
- **Fix:** `_showGameError` reduced to a no-op; global `window.onerror` removed.
  See `index.html` near the bottom of the script.
- **Verify:** `grep -n "rgba(200,0,0" index.html` returns zero matches.

---

## Submissions

(Add entries below as you submit. Template:)

### YYYY-MM-DD — vN
- **Status:** approved / rejected
- **Reviewer notes:**
- **Root cause:**
- **Fix:**
- **Verification grep:**
