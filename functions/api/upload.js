// POST /api/upload  (multipart/form-data)
//   fields: title, hook, genre, author, contact(optional)
//   files:  game (.zip, <=24MB), cover (image, optional, <=2MB)
//
// Community game submission. Requires a signed-in session (magic-link). The zip
// is structurally validated at the door via a central-directory read only — it
// is never decompressed or executed here, so there is no zip-bomb exposure. The
// gate enforces: root index.html, relative paths, an allowed-filetype set, and a
// sane file count + declared size. The raw zip is then stored INERT in KV
// (uploadblob:<id>) with a metadata record (upload:<id>, status 'pending').
// Deep behavioral vetting (static scan + locked-plan-mode review agent) is the
// sandboxed review pipeline's job; an admin approve then deploys it to the
// cross-site sandbox host. Rate: 5/day/uid.
//
// KV value ceiling is 25 MiB, so the zip cap is 24 MB; larger 3D builds need the
// R2 path (not built yet). Blobs self-expire after 45 days so abandoned uploads
// don't accumulate.

import { readSession } from './_session.js';
import { json, jsonError } from '../_lib/response.js';
import { checkRate } from '../_lib/rateLimit.js';
import { listZipEntries, validateGameZip } from '../_lib/zipInspect.js';

const MAX_ZIP = 24 * 1024 * 1024;
const MAX_COVER = 2 * 1024 * 1024;
const DAILY_CAP = 5;
const ATTEMPT_CAP = 30;               // total upload attempts/day/uid (accepted + rejected)
const BLOB_TTL = 60 * 60 * 24 * 45;
const FAIL_TTL = 60 * 60 * 24 * 14;   // rejected-upload debug records (shorter)

export async function onRequestPost({ request, env }) {
  const session = await readSession(request, env);
  if (!session) return jsonError('sign_in_required', 401);

  // Bound total upload ATTEMPTS per user per day (accepted + rejected), checked
  // up front so malformed-upload spam can't burn the shared free-tier KV write
  // budget via the failure-capture path below. checkRate stops writing once the
  // cap is hit, so past-cap spam costs only a read. Generous vs DAILY_CAP
  // (accepted uploads, 5) so iterating on a rejected zip isn't locked out.
  const day = new Date().toISOString().slice(0, 10);
  if (!await checkRate(env, `uploadtry:${session.uid}:${day}`, ATTEMPT_CAP, 60 * 60 * 26))
    return jsonError('daily_limit_reached', 429);

  let form;
  try { form = await request.formData(); } catch { return jsonError('invalid_form', 400); }

  const title = String(form.get('title') || '').trim();
  const hook = String(form.get('hook') || '').trim();
  const genre = String(form.get('genre') || 'community').trim().toLowerCase().slice(0, 24) || 'community';
  const author = String(form.get('author') || '').trim();
  const contact = String(form.get('contact') || session.email || '').trim().slice(0, 200);
  if (title.length < 3 || title.length > 80) return jsonError('bad_title', 400);
  if (hook.length > 200) return jsonError('bad_hook', 400);
  if (author.length > 80) return jsonError('bad_author', 400);

  const game = form.get('game');
  if (!game || typeof game === 'string') return jsonError('no_game_file', 400);
  if (game.size > MAX_ZIP) {
    await recordFailure(env, session, game, title, 'game_too_large');
    return jsonError('game_too_large', 413);
  }
  if (game.size < 64) return jsonError('game_too_small', 400);
  const bytes = new Uint8Array(await game.arrayBuffer());
  // zip local-file-header magic PK\x03\x04, or empty-archive PK\x05\x06
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05))) {
    await recordFailure(env, session, game, title, 'not_a_zip');
    return jsonError('not_a_zip', 400);
  }

  // Cheap structural gate (central-directory read only — never decompressed, so
  // zip-bomb-safe). Deep behavioral vetting is the sandboxed review pipeline.
  let zipEntries;
  try {
    zipEntries = listZipEntries(bytes);
  } catch {
    await recordFailure(env, session, game, title, 'zip_unreadable');
    return jsonError('zip_unreadable', 400);
  }
  const zv = validateGameZip(zipEntries);
  if (!zv.ok) {
    // Capture the rejection so the admin can debug it without the user's copy:
    // the error code, the offending file (zv.detail), and the full file list —
    // exactly what was missing when AGKPlayer.html.mem got rejected (2026-05-30).
    await recordFailure(env, session, game, title, zv.error, {
      detail: zv.detail || null,
      files: zipEntries.filter(e => !e.name.endsWith('/')).map(e => e.name).slice(0, 80),
    });
    return jsonError(zv.error, 400);
  }

  // Separate cap on ACCEPTED uploads (5/day/uid), checked only after validation
  // passes so a developer iterating on a rejected zip isn't locked out of a real
  // upload by fumbled attempts. `day` is declared at the attempt-cap check above.
  if (!await checkRate(env, `uploadrate:${session.uid}:${day}`, DAILY_CAP, 60 * 60 * 26))
    return jsonError('daily_limit_reached', 429);

  let coverBytes = null, coverType = null;
  const cover = form.get('cover');
  if (cover && typeof cover !== 'string' && cover.size > 0) {
    if (cover.size > MAX_COVER) return jsonError('cover_too_large', 413);
    if (!/^image\//.test(cover.type || '')) return jsonError('bad_cover_type', 400);
    coverBytes = new Uint8Array(await cover.arrayBuffer());
    coverType = cover.type;
  }

  const ts = Date.now();
  const id = ts.toString(36) + Math.random().toString(36).slice(2, 6);
  const slug = `${slugify(title)}-${id.slice(-4)}`;

  await env.VOTES.put(`uploadblob:${id}`, bytes, { expirationTtl: BLOB_TTL });
  if (coverBytes)
    await env.VOTES.put(`uploadcover:${id}`, coverBytes, { expirationTtl: BLOB_TTL });

  const record = {
    id, slug, title, hook, genre, author, contact,
    uid: session.uid, email: session.email,
    sizeBytes: game.size, fileCount: zv.fileCount, declaredBytes: zv.declaredBytes,
    hasCover: !!coverBytes, coverType,
    status: 'pending', scan: null, verdict: null, ts,
  };
  await env.VOTES.put(`upload:${id}`, JSON.stringify(record), { expirationTtl: BLOB_TTL });

  return json({ ok: true, id, slug });
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';
}

// Store a small debug record for a rejected upload under uploadfail:<id> (14-day
// TTL). The raw zip is NOT kept — just who/what/why + the zip's file list, which
// is enough to diagnose disallowed_filetype / no_root_index / size rejections
// without the submitter re-sending the file. Best-effort: a capture failure must
// never change the error the user sees, so it is wrapped in try/catch.
async function recordFailure(env, session, game, title, error, extra = {}) {
  try {
    const ts = Date.now();
    const id = ts.toString(36) + Math.random().toString(36).slice(2, 6);
    await env.VOTES.put(`uploadfail:${id}`, JSON.stringify({
      id, ts, status: 'rejected', error,
      uid: session.uid, email: session.email,
      title: String(title || '').slice(0, 80),
      filename: String((game && game.name) || '').slice(0, 200),
      sizeBytes: (game && game.size) || 0,
      ...extra,
    }), { expirationTtl: FAIL_TTL });
  } catch { /* capture is best-effort; never block the user's response */ }
}
