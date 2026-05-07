<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Tim's Game Lab (game-factory.tech).

## Summary of changes

Because the gallery is a static vanilla-JS site deployed to Cloudflare Pages (no build step), the PostHog public token is delivered via a **Cloudflare Pages Function** (`functions/posthog-init.js`) that reads `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` from CF environment variables at request time. The function is served at `/posthog-init` and included as a synchronous `<script src="/posthog-init">` in each HTML page. This ensures the token never appears in source files.

**Files created / modified:**

| File | Change |
|---|---|
| `functions/posthog-init.js` | New CF Pages Function — serves the PostHog JS snippet with token/host from env vars |
| `posthog-init.js` | Replaced with a comment; the CF function is the real entry point |
| `wrangler.toml` | Added `[vars]` block documenting `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` (set real values in CF dashboard) |
| `.env` | Created with `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` for local dev |
| `index.html` | Added `<script src="/posthog-init">` |
| `play.html` | Added `<script src="/posthog-init">` |
| `login.html` | Added `<script src="/posthog-init">` |
| `app.js` | Added identify, reset, and 5 events (see table below) |

## Events instrumented

| Event | Description | File |
|---|---|---|
| `game_card_clicked` | User clicked a game card (thumbnail or Play button) from the gallery — top of conversion funnel. Properties: `slug`, `game_title`, `source` | `app.js` |
| `gallery_vote_cast` | User cast a like/dislike/clear vote from a gallery card. Properties: `slug`, `action`, `previous_vote` | `app.js` |
| `tab_changed` | User switched gallery tabs (top / recent / liked / all). Properties: `tab` | `app.js` |
| `genre_filter_applied` | User selected a genre filter. Properties: `genre` | `app.js` |
| `game_searched` | User typed a search query (debounced 600 ms). Properties: `query_length` | `app.js` |
| `game_play_started` | Play page loaded with a valid game and iframe mounted. Properties: `slug`, `game_title` | `play.html` |
| `game_voted` | User voted like/dislike/clear in the player. Properties: `slug`, `action`, `seconds_played` | `play.html` |
| `game_shared` | User clicked Share (Web Share API or clipboard). Properties: `slug`, `method` | `play.html` |
| `game_feedback_submitted` | User submitted the rate-on-leave overlay. Properties: `slug`, `vote`, `has_comment` | `play.html` |
| `more_games_rail_shown` | "More games" rail appeared after game-over signal. Properties: `slug` | `play.html` |
| `login_form_submitted` | User submitted their email on the sign-in page. | `login.html` |
| `login_link_sent` | Server confirmed the magic link email was dispatched. | `login.html` |

**User identification:** `posthog.identify(me.uid, { email: me.email })` is called in `app.js` after `/api/me` resolves for signed-in users. `posthog.reset()` is called when the sign-out link is clicked.

## Next steps

We've built a dashboard and five insights for you to keep an eye on user behaviour:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/174257/dashboard/666651

### Insights

1. **Game Play Funnel: Gallery → Play → Vote** — conversion funnel across the three critical steps
   https://eu.posthog.com/project/174257/insights/HjLti8zh

2. **Daily game plays (game_play_started)** — volume of play sessions per day
   https://eu.posthog.com/project/174257/insights/jC51SLnR

3. **Vote sentiment: likes vs dislikes** — `game_voted` broken down by `action`
   https://eu.posthog.com/project/174257/insights/Q9QgbZ55

4. **Top games by plays** — `game_play_started` broken down by `slug`
   https://eu.posthog.com/project/174257/insights/G4qXp8DO

5. **Login funnel: submit → link sent** — magic-link auth conversion rate
   https://eu.posthog.com/project/174257/insights/IvkYvL0X

## Before going live

Set the real values in **Cloudflare Pages → tims-arcade → Settings → Environment variables**:

- `PUBLIC_POSTHOG_KEY` — your PostHog project token
- `PUBLIC_POSTHOG_HOST` — your PostHog host (e.g. `https://eu.i.posthog.com`)

Then redeploy (or trigger a CF Pages rebuild) so the function picks them up.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_web/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
