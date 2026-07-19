# Tim's Game Lab — Deploy Guide

Static gallery + serverless vote API hosted on Cloudflare Pages with Pages Functions and a KV namespace. Free tier is plenty for a personal site.

## What's in this folder

```
Gallery/
├── index.html, play.html, style.css, app.js, sdk.js   ← static site
├── games.json                  ← public manifest read by the site
├── games.source.json           ← canonical metadata (edit this; sync rebuilds games.json)
├── games/<slug>/index.html     ← copies of each playable game
├── thumbs/<slug>.png           ← card thumbnails
├── functions/api/
│   ├── counts.js               ← GET /api/counts
│   └── vote.js                 ← POST /api/vote
├── scripts/
│   ├── sync_games.sh           ← rebuild games/, thumbs/, games.json from games.source.json
│   └── screenshot_gallery.js   ← local visual smoke test
├── wrangler.toml               ← Cloudflare config (filled in below)
└── DEPLOY.md                   ← this file
```

## First deploy (one-time setup)

1. **Install wrangler** (Cloudflare's CLI):
   ```bash
   npm install -g wrangler
   ```

2. **Log in to Cloudflare** (opens browser):
   ```bash
   wrangler login
   ```

3. **Create the KV namespace** for vote storage:
   ```bash
   cd ~/Desktop/Agents/Gallery
   wrangler kv namespace create VOTES
   ```
   → copy the `id` it returns. Paste it into `wrangler.toml`, uncomment the `[[kv_namespaces]]` block, replace `PASTE_NAMESPACE_ID_HERE`.

4. **Create the Pages project**:
   ```bash
   wrangler pages project create tims-arcade
   ```
   It will ask for a production branch — type `main`.

5. **Deploy**:
   ```bash
   wrangler pages deploy . --project-name=tims-arcade
   ```
   It will print a URL like `https://tims-arcade.pages.dev`.

6. **Bind the KV namespace to the Pages project** (this is the only step that *must* be done in the dashboard, not via CLI):
   - Visit `https://dash.cloudflare.com` → Pages → tims-arcade → Settings → Functions → KV namespace bindings
   - Add binding: variable name `VOTES`, namespace = the one you created in step 3.
   - Click Save. Then trigger one more deploy so functions pick it up:
     ```bash
     wrangler pages deploy . --project-name=tims-arcade
     ```

7. **Open the URL** and verify:
   - The home page shows 3 games.
   - Click a thumbnail — game loads in `/play.html?slug=...`.
   - Click 👍 — the count goes from 0 → 1 and stays after refresh.

## Updating the gallery (per-day workflow)

After the daily game-factory runs and a new game lands in `Games/N_slug/`:

1. Append an entry to `Gallery/games.source.json`:
   ```json
   {
     "slug": "rail_tycoon",
     "gameDir": "Games/19_rail_sorter",
     "title": "Rail Tycoon",
     "hook": "Drag rails between colored stations…",
     "addedDate": "2026-05-05",
     "published": true
   }
   ```

2. Run the sync script (copies the latest `index.html`, regenerates thumbnails and `games.json`):
   ```bash
   bash Gallery/scripts/sync_games.sh
   ```

3. Deploy:
   ```bash
   cd Gallery && wrangler pages deploy . --project-name=tims-arcade
   ```

That's it. Set `published: false` for any game you don't want public yet.

## Local testing

```bash
cd Gallery
python3 -m http.server 8080
# open http://localhost:8080
```

Vote API won't work locally without `wrangler pages dev .`, but the gallery and game iframes will, and votes fall back to localStorage-only.

For Pages Functions running locally:
```bash
cd Gallery
wrangler pages dev . --kv VOTES
```

## Dissertation service-evaluation database

The public repository contains the D1 schema but intentionally does not contain
the game-to-condition mapping or frozen 56-sequence schedule. Those blinded
evaluation artifacts live in the private `qmul-agentic-game-production`
workspace.

Build the public opaque game copies and private seed together:

```bash
python3 scripts/build_dissertation_study.py \
  --source-root /path/to/private/qmul-agentic-game-production
python3 /path/to/private/qmul-agentic-game-production/scripts/build_dissertation_schedule.py
```

Apply public migrations first. They rename the session metadata to
`information_version`, `service_evaluation_basis`, and `opened_at`, and create
the frozen-schedule claim/completion tables. Cloudflare's migration runner does
not reliably parse trigger bodies, so install the public idempotent guard file
with `d1 execute --file` next. Only then apply the private game and schedule
seeds to the dedicated `dissertation-study` database:

```bash
npx wrangler d1 migrations apply dissertation-study --remote
npx wrangler d1 execute dissertation-study --remote \
  --file=scripts/dissertation_schedule_guards.sql
npx wrangler d1 execute dissertation-study --remote \
  --file=/path/to/private/qmul-agentic-game-production/artifacts/player_study/dissertation-player-v1/0002_dissertation_games.sql
npx wrangler d1 execute dissertation-study --remote \
  --file=/path/to/private/qmul-agentic-game-production/artifacts/player_study/dissertation-player-v1/seed_dissertation_schedule.sql
npx wrangler d1 execute dissertation-study --remote \
  --command="SELECT COUNT(*) AS active_games FROM study_games WHERE active=1; \
    SELECT COUNT(*) AS sequences FROM study_schedule_sequences; \
    SELECT COUNT(*) AS slots FROM study_schedule_items; \
    SELECT COUNT(*) AS schedule_guards FROM sqlite_master \
      WHERE type='trigger' AND name LIKE 'trg_study_schedule_%';"
```

The required results are 56 active games, 56 sequences, 280 slots, and 13
schedule guards. The API checks the exact expected guard-trigger name set, so it
fails closed if the separate public guard step is omitted or incomplete. It also
checks that every active game appears exactly five times and exactly once at
each order position. The private schedule seed must insert the schedule as
inactive, idempotently insert its sequences and items, and set `active=1` only
as its final statement. Activation requires schedule SHA-256
`7c9d936307af533b738be71b08356e6dba987a2c9e9438a6b57c1de4d1dcebd2`.
The runtime recomputes that hash from canonical sequence/item rows, and database
triggers prevent active rows from changing.

Production activation receipt (2026-07-19): migration `0004`, all 13 public
guards, and the private frozen schedule were applied to `dissertation-study`
before the opening code was pushed. The verified state was 57 stored games, 56
active games, 56 sequences, 280 slots, the exact schedule hash above, and zero
sessions, assignments, responses, claims, or completions. The
`DISSERTATION_STUDY_OPEN = "1"` setting below is therefore deliberate, not a
request for Pages to run those database steps automatically.

Service evaluation opens only when all three namespaced server settings and D1
are present:

```toml
DISSERTATION_STUDY_OPEN = "1"
DISSERTATION_SERVICE_EVALUATION_BASIS = "qmul-service-evaluation-email-alvaro-bort"
DISSERTATION_INFORMATION_VERSION = "service-evaluation-notice-v1"
```

The information version shown beside the visible data notice is sent when the
player chooses Begin and is stored with that session. There is no consent
checkbox or consent boolean.

The frozen game payloads landed in the four commits immediately before the
study shell. Verify the complete checkout—not only the latest diff—before
deploying:

```bash
python3 scripts/verify_dissertation_pool.py
```

The verifier requires all 56 opaque pool paths, checks each served SHA-256
against the public integrity manifest, rejects extra/missing game directories,
and confirms that the public JSON contains no condition, prompt, run, batch, or
source mapping.

Keep the path-scoped Pages Analytics removal and `no-transform` middleware on
all dissertation HTML. Pages injects its marked browser beacon into static HTML
before Functions run; middleware removes that exact snippet, and
`no-transform` prevents a later edge rewrite. Without both controls the frozen
game bytes change and a second telemetry stream exists outside the research
record.

The mutation API uses atomic D1 buckets to allow at most 20 requests per minute
for new-session creation and per random session UUID, plus a global ceiling of
500 new sessions per UTC day. Session creation atomically claims the next
never-issued frozen sequence. Only after all 56 have been issued can a sequence
without a primary completion be reissued, and only when its latest claim is at
least 30 minutes old. The first completed session for each sequence is the
primary cohort; later completions remain stored but are flagged non-primary in
the admin export.

Status remains closed if the abuse-control or schedule tables are unavailable.
These controls do not store IP addresses, cookies, device fingerprints, or
other participant identifiers. Browser playtime counts visible-display time:
it pauses while the document is hidden, while visibility losses remain recorded
separately.

## Creator builder rollout settings

The `/create` Codex pilot is fail-closed and configured through Pages secrets,
not source code:

- `GAME_FACTORY_COMPED_CREATOR_UIDS` — comma-separated 16-hex UIDs derived by
  `functions/_lib/uid.js`; only verified sessions whose email hashes back to an
  explicitly listed UID receive included builds and the `trusted-codex` lane.
- `GAME_FACTORY_PUBLIC_BUILDER_ENABLED` — set to `1` only when a separately
  reviewed public worker is online. Unset/anything else returns 503 before any
  ordinary user's tokens are spent or a public job is queued.

Deploy the lane-aware API before restarting the Mac relay. Verify the test UID
on production first; add a partner UID only after the walkthrough is approved.

## Custom domain (when you're ready)

In the Cloudflare dashboard → Pages → tims-arcade → Custom domains. Add the domain you bought, follow the DNS instructions. Free.

## Free-tier limits

| Resource | Free tier | Will you hit it? |
|----------|-----------|------------------|
| Pages bandwidth | unlimited | no |
| Functions requests | 100k / day | unlikely |
| KV reads | 100k / day | unlikely (15s cache on `/api/counts`) |
| KV writes | 1k / day | only at huge spikes — switch to D1 if needed |
| KV storage | 1 GB | no — counts are tiny JSON |

## Troubleshooting

- **`/api/counts` returns 500**: KV binding not added. Re-do step 6.
- **Votes don't persist across browsers**: that's correct — votes are anonymous and stored on the server. Each visitor's *own* vote highlight is stored in localStorage so a refresh from the same browser remembers what you clicked.
- **A new game's iframe is blank**: check the iframe URL works directly (`/games/<slug>/index.html`). If 404, the sync script didn't copy the file — verify the entry in `games.source.json` points at the right `gameDir`.
- **Thumbnails missing**: the sync script looks for `<gameDir>/yandex_promo/desktop_en_1.png` first, then `desktop_ru_1.png`, then `mobile_en_1.png`. Make sure at least one exists.

## Next steps (parking lot)

- Auto-sync hook in the `game-factory` skill so day N's build appends to `games.source.json` automatically.
- Per-game URL slugs that don't change when game number changes.
- Play counter (separate from votes) — increment KV on iframe load.
- Daily/weekly leaderboard of most-liked games.
- "Comments" mode (nano-comments via KV).
- Submission form (when you eventually want users to upload games).
