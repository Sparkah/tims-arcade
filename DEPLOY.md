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

## Dissertation study database

The public repository contains the D1 schema but intentionally does not contain
the game-to-condition seed. That mapping is blinded research data and lives in
the private `qmul-agentic-game-production` workspace.

Build the public opaque game copies and private seed together:

```bash
python3 scripts/build_dissertation_study.py \
  --source-root /path/to/private/qmul-agentic-game-production
```

The private seed is written below that repository's
`artifacts/player_study/dissertation-player-v1/` directory. Apply it only to the
dedicated `dissertation-study` database, then verify the row count:

```bash
npx wrangler d1 migrations apply dissertation-study --remote
npx wrangler d1 execute dissertation-study --remote \
  --file=/path/to/private/0002_dissertation_games.sql
npx wrangler d1 execute dissertation-study --remote \
  --command="SELECT COUNT(*) AS active_games FROM study_games WHERE active=1"
```

The required result is `56`. Collection remains closed unless all three
server-side gates are present: `DISSERTATION_STUDY_OPEN=1`, a non-empty
`DISSERTATION_ETHICS_CONFIRMATION_ID`, and a non-empty
`DISSERTATION_CONSENT_VERSION`. Never enable them before the written
approval/exemption and participant wording are confirmed.

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

Keep `no-transform` on all dissertation HTML. Cloudflare Pages Web Analytics
otherwise injects a browser beacon after deployment, changing the frozen game
bytes and creating a second telemetry stream outside the research record.

The mutation API uses atomic D1 buckets to allow at most 20 requests per minute
for new-session creation and per random study session, plus a global ceiling of
500 new sessions per UTC day. Status remains closed if the abuse-control table
is unavailable. These controls do not store IP addresses, cookies, device
fingerprints, or other participant identifiers.

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
