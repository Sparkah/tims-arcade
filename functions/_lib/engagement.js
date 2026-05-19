// Canonical engagement-score formula.
//
// One definition consumed by:
//   - functions/api/admin/stats.js  (admin dashboard + iteration queue)
//   - Gallery/app.js                (gallery "Top Rated" sort)             — see MIRROR below
//   - Shared/skills/game-factory/tools/eligibility_check.sh  (factory iteration ranking) — see MIRROR below
//
// Formula:
//   engagement = seconds + (likes - dislikes) * 5
//
// Why this formula:
//   - Time-on-game is the load-bearing engagement signal. A 10-second click
//     bounce shouldn't outrank a 5-minute play just because it has more
//     plays.
//   - Likes/dislikes net is a smaller multiplier on top so games with no
//     vote signal yet still rank by time alone, but votes can promote or
//     demote.
//   - Avg-session-length and play-count are NOT in the formula directly —
//     they're already encoded in `seconds`. Earlier app.js formula
//     (minutes*3 + plays + net*5) double-counted plays vs avg-time, causing
//     drift vs factory's iteration ranking (apartment_cleaner gallery rank
//     7 vs factory rank 19, tire_escape rank 20 vs rank 7).
//
// History:
//   - 2026-05-19: Unified. Previously app.js used a play-count-weighted
//     variant; admin + factory used time + net votes. See
//     Knowledge/Operations/Engagement Formula.md.
//
// MIRRORS:
//   - Gallery/app.js → function engagementScore(g)
//   - Shared/skills/game-factory/tools/eligibility_check.sh → jq score expr
//   - When changing this file, update both mirrors and the Knowledge doc.

export function computeEngagement({ plays = 0, seconds = 0, likes = 0, dislikes = 0 } = {}) {
  return (seconds || 0) + ((likes || 0) - (dislikes || 0)) * 5;
}
