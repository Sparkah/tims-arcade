// Public, non-secret config for the Game Factory Arcade Discord Activity.
// Mirrors Gallery/tg-megaton/config.js (public IDs only - NO client secret here;
// the OAuth client secret lives in a Cloudflare Worker env, never in client code).
window.DISC_CONFIG = {
  DISCORD_CLIENT_ID: '1521607835513917621', // Application ID (= OAuth Client ID), created 2026-06-30
  APP_NAME: 'Game Factory Arcade'
};
