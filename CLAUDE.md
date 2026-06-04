# Gallery CLAUDE.md

Auto-loaded when Claude Code is invoked from within `Gallery/`. Parent project context lives at `../CLAUDE.md`. This file is Gallery-specific.

## What this codebase is

The live game gallery at **https://game-factory.tech** (Cloudflare Pages, repo `Sparkah/tims-arcade`). NOT a throwaway. Every `git push` to `main` triggers a CF Pages auto-deploy.

Surface area:

- `index.html` / `play.html` / `admin.html` / `lab.html` / `login.html` — HTML entry points
- `app.js` (43KB) — main client logic: card rendering, voting UX, theme switching, identity, PostHog wiring
- `style.css` (~30KB) — single Lab theme, tokens at `:root`, self-hosted fonts. Brutalist + Editorial themes existed until 2026-05-22, deleted as dead code (recoverable from git history)
- `functions/api/**` — 25+ Cloudflare Functions:
  - `auth/*` — magic-link request/verify/logout (Resend + HMAC session cookie `tgl_session`)
  - `vote.js`, `counts.js`, `feedback.js`, `feedback-image.js` — voting + rate-on-leave overlay
  - `play.js`, `heartbeat.js`, `click.js` — analytics + A/B test rotation
  - `leaderboard.js`, `scores.js`, `trending.js`, `featured.js` — game discovery surfaces
  - `comments.js`, `me.js`, `me/meta.js` — per-user state
  - `admin/stats.js`, `admin/user-digests.js`, `admin/feedback-image.js` — admin dashboard
  - `p/[slug].js` — share-card SSR
- `functions/_lib/cookie.js`, `_lib/meta.js` — shared
- `scripts/sync_games.sh`, `append_game.sh`, `cachebust_assets.sh`, `check_art.sh`, `install_hooks.sh`, `pre_push_review.sh`, `translate_games.py` — build + deploy + quality-gate tooling
- KV namespace bound as `GAMES_KV` (counts, votes, sessions, A/B variants)
- PostHog instrumentation (12 events) — EU project 174257 dashboard 666651

## Workflow — use Pocock skills first

These six skills are installed for Gallery work. Tim wants them used, not stored. Default to them when the trigger matches — don't skip straight to editing files.

### `/pocock-zoom-out` — first touch on unfamiliar code

If you don't already have a clean mental model of the area you're about to edit, START here. One-prompt skill that returns a module map + caller graph in the project's vocabulary.

When: any time you're about to read or edit Gallery code you haven't touched in this session, especially `app.js` and `functions/api/**`.

### `/pocock-diagnose` — any bug, ever

Disciplined diagnosis loop: **build a fast deterministic feedback loop FIRST**, then bisection / hypothesis / instrument all consume that signal. The skill is the loop, everything else is mechanical.

When: vote counts wrong, auth flow breaking, KV race, A/B test stuck, share-card SSR mismatch, comment posting fails, theme toggle regression, anything Tim says is "broken" or "weird".

Specific Gallery loops worth knowing:

- Curl-against-wrangler dev: `npx wrangler pages dev .` then `curl localhost:8788/api/vote -X POST -d '...'`
- HTTP replay: hit prod with `curl -H 'cookie: tgl_session=...'` to reproduce auth-specific bugs
- KV state dump: `npx wrangler kv:key get --binding=GAMES_KV <key>` to confirm what's actually stored
- Heartbeat tracing: paste the network panel HAR or run with `?debug=1` query param

### `/pocock-grill-me` — before any non-trivial Gallery change

Single-prompt interview that walks every branch of the design tree, recommending an answer per question. Catches "we didn't think about X" before half a day of implementation.

When: Tim proposes a new gallery section, a new function, a schema change, a new auth path, an extra event, a new theme. Anything that feels like "let's try X".

### `/pocock-prototype` — UI variant exploration

UI branch: build several radically different variations on a single route, toggleable via URL search param + floating bottom bar. The pattern Tim already does informally with the three themes.

When: redesigning a section of the gallery, exploring new tutorial overlays, comparing rate-on-leave UX patterns, testing alternative card layouts.

Output goes in a clearly-marked throwaway file (e.g. `lab.html?proto=cardgrid-v2`). Delete or absorb when the decision crystallises.

### `/pocock-improve-architecture` — periodic refactor pass

Surfaces "deepening opportunities" using a deletion test and deep-vs-shallow module framing. Aimed at shared infra (`app.js`, `functions/`, `Gallery/scripts/`, `_lib/`).

When: NOT for individual games. Run on Gallery code when:

- Tim says "this is getting messy"
- Multiple bugs cluster in the same file
- A new feature would require touching 6+ files
- After shipping a significant new subsystem (run it before the next one)

Look for shallow modules (wrappers that re-export but add nothing) and tightly-coupled groups that should consolidate. Update `Knowledge/Operations/` with the rationale of any refactor it suggests, so future Claude sees the WHY.

### `/pocock-git-guardrails` — PreToolUse safety hook

Already customised for this project — `git push` is ALLOWED (CF auto-deploy depends on it). Force-push and destructive ops blocked. Install steps live in the skill's SKILL.md.

When Tim wants to harden against agent-induced data loss, point him at it. Otherwise it just sits there as a safety net once installed.

## Gallery-specific hard rules

- **`git push` triggers a production deploy**. There is no staging branch. A push to `main` USUALLY goes live within ~60s — but NOT always: the scorecard can abort it, a ref race can reject it, or GitHub accepts the commit while the CF Pages build queues/lags/fails (then the old build keeps serving). **"Pushed" != "live."**
- **VERIFY the deploy landed; redo until it does (Tim 2026-06-04).** After any Gallery push, confirm the LIVE site serves the new bytes: `bash Gallery/scripts/push_and_verify.sh --url games/<slug>/ --marker <new-string> [--push] [--retrigger]`. ALWAYS curl with `-L` — game pages 308-redirect (`/games/<slug>/index.html` -> `/games/<slug>/`), and a `-L`-less curl reads an EMPTY redirect body and falsely reports "not live" (the 2026-06-04 false alarm). A deploy that didn't land gets re-triggered (empty commit) until it's live.
- **Pre-push pipeline is mandatory**: `Gallery/.git/hooks/pre-push` runs stage-0 (cover-art check) + stage-1 (Yandex mechanical check) + stage-2 (6-axis AI scorecard). Don't bypass with `--no-verify` unless Tim explicitly asks.
- **Cachebust assets after editing CSS/JS**: `Gallery/scripts/sync_games.sh` tails into `cachebust_assets.sh` automatically. If editing `style.css`/`app.js`/`identity.js`/`sdk.js` directly without running sync, manually run `bash scripts/cachebust_assets.sh` before push.
- **KV is shared with prod from local wrangler dev**. `npx wrangler pages dev` connects to the LIVE KV namespace. A test write IS a prod write. Use a `--remote=false` flag or a separate namespace if you need isolation.
- **Functions logs are in CF dashboard**, not local. `wrangler pages deployment tail` for live tailing.
- **Free KV tier — 1000 writes/day**. The 5-min cache + visibility-aware heartbeat pattern protects this. Don't add ungated writes without checking the budget.
- **PostHog events should match the existing 12-event taxonomy** when adding new ones. See `Knowledge/Operations/PostHog Events.md` (if it exists) or grep `posthog.capture` in app.js.

## File-edit checklist

Before pushing changes that touch any Gallery file:

1. Ran `pocock-zoom-out` first if unfamiliar with the area (one minute, saves rework)
2. Local test via `npx wrangler pages dev .` if changing a function
3. Manual smoke in browser if changing UI (golden path + at least one edge case)
4. `bash scripts/sync_games.sh` to refresh games.json + cachebust if needed
5. Pre-push hook will run mechanically — read its output, don't blindly retry
6. If pre-push fails on the scorecard (< 5.0 avg), READ the per-axis breakdown before deciding to retry vs adjust the diff
