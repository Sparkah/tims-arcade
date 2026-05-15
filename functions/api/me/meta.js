// GET /api/me/meta
// Returns the visitor's gallery meta state, keyed by their `uid` cookie:
//   {
//     tokens: int,         // current spendable balance
//     lifetime: int,       // total ever earned (drives the leaderboard)
//     streak: int,         // consecutive daily logins
//     bestStreak: int,     // peak streak the player has hit
//     lastLogin: 'YYYY-MM-DD',
//     unlocked: ['theme:editorial', 'flair:cherry-blossom', ...],
//     newlyGranted: { login?: int, streak?: int, milestones?: [{day, bonus}] }
//   }
//
// First call of each UTC day grants the daily login bonus + streak bonus.
// Cookie-only — no sign-in required, since the gallery is anonymous-friendly.

const DAILY_LOGIN_BONUS = 10;
const STREAK_BONUSES   = [ // day → bonus (cumulative on top of daily)
  { day: 3,  bonus: 20  },
  { day: 7,  bonus: 50  },
  { day: 14, bonus: 100 },
  { day: 30, bonus: 200 },
  { day: 60, bonus: 400 },
];

function todayUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-'
       + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
       + String(d.getUTCDate()).padStart(2, '0');
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

import { parseCookie } from '../../_lib/cookie.js';

function emptyMeta() {
  return { tokens: 0, lifetime: 0, streak: 0, bestStreak: 0, lastLogin: null, unlocked: [] };
}

export async function readMeta(env, uid) {
  if (!uid) return emptyMeta();
  const raw = await env.VOTES.get(`meta:${uid}`, 'json');
  if (!raw) return emptyMeta();
  // Backfill any missing keys for forward-compat.
  const m = emptyMeta();
  return Object.assign(m, raw);
}

export async function writeMeta(env, uid, meta) {
  if (!uid) return;
  await env.VOTES.put(`meta:${uid}`, JSON.stringify(meta));
}

export async function creditTokens(env, uid, amount) {
  if (!uid || !amount || amount <= 0) return;
  const m = await readMeta(env, uid);
  m.tokens   += amount;
  m.lifetime += amount;
  await writeMeta(env, uid, m);
}

export async function onRequestGet({ request, env }) {
  const uid = parseCookie(request.headers.get('Cookie') || '', 'uid');
  if (!uid) {
    return new Response(JSON.stringify(emptyMeta()), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const meta = await readMeta(env, uid);
  const today = todayUTC();
  const newlyGranted = { milestones: [] };

  // Daily login + streak logic — only triggers on the first call of each UTC day.
  if (meta.lastLogin !== today) {
    if (!meta.lastLogin) {
      // First visit ever
      meta.streak = 1;
    } else {
      const gap = daysBetween(meta.lastLogin, today);
      if (gap === 1) {
        meta.streak = (meta.streak || 0) + 1;
      } else if (gap > 1) {
        meta.streak = 1; // reset on miss
      }
      // gap <= 0 (clock drift / replay) — leave alone
    }
    if (meta.streak > (meta.bestStreak || 0)) meta.bestStreak = meta.streak;

    meta.tokens   += DAILY_LOGIN_BONUS;
    meta.lifetime += DAILY_LOGIN_BONUS;
    newlyGranted.login = DAILY_LOGIN_BONUS;

    // Streak milestones (one-shot per streak — fires the day you HIT the day)
    for (const { day, bonus } of STREAK_BONUSES) {
      if (meta.streak === day) {
        meta.tokens   += bonus;
        meta.lifetime += bonus;
        newlyGranted.milestones.push({ day, bonus });
      }
    }

    meta.lastLogin = today;
    await writeMeta(env, uid, meta);
  }

  return new Response(JSON.stringify(Object.assign({}, meta, { newlyGranted })), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
