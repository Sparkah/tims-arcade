#!/usr/bin/env node
/** Studio `published` controls discovery only; valid live links stay public. */

const path = require('path');

const GALLERY = path.resolve(__dirname, '..');
const ID = '41df96fb1c34af1026252b936bda6cc3';
const AUTH_SECRET = 'creation-access-test-secret';

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sessionCookie(payload) {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, exp_ts: Date.now() + 60_000 })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(AUTH_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `__Host-tgl_session=${body}.${sig}`;
}

function makeEnv(options = {}) {
  const {
    published = false,
    visibility,
    status = 'live',
    source = 'vibe',
    disabled = false,
    includeUpload = true,
    includeBlob = true,
  } = options;
  const upload = { id:ID, uid:'pit-owner', source, status, published, slug:'coldscale-6cc3' };
  if (visibility) upload.visibility = visibility;
  if (disabled) upload.disabled = true;
  const store = new Map([
    [`creation-levels:${ID}`, JSON.stringify({ schema:'game-factory-generic-levels-v1', source:'embedded-seed', levels:[{ name:'One', width:360, height:640, player:{x:20,y:560}, goal:{x:320,y:80}, objects:[] }] })],
    [`creationcover:${ID}`, 'iVBORw0KGgo='],
  ]);
  if (includeUpload) store.set(`upload:${ID}`, JSON.stringify(upload));
  if (includeBlob) store.set(`genblob:${ID}`, '<!DOCTYPE html><html><body>game</body></html>');
  return {
    AUTH_SECRET,
    ADMIN_EMAILS:'tim-admin@example.com',
    ADMIN_TOKEN:'operator-bearer-token',
    _store:store,
    VOTES:{
      async get(key, type) {
        const value = store.get(key);
        if (value == null) return null;
        return type === 'json' ? JSON.parse(value) : value;
      },
      async put(key, value) { store.set(key, String(value)); },
      async delete(key) { store.delete(key); },
      async list({ prefix = '' } = {}) {
        return { keys:Array.from(store.keys()).filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete:true };
      },
    },
  };
}

async function requestPair(gameMod, levelsMod, env, cookie, extraHeaders = {}) {
  const headers = { ...(cookie ? { cookie } : {}), 'sec-fetch-dest':'iframe', ...extraHeaders };
  const game = await gameMod.onRequestGet({ request:new Request(`https://game-factory.test/g/${ID}`, { headers }), env, params:{ id:ID } });
  const levels = await levelsMod.onRequestGet({ request:new Request(`https://game-factory.test/api/creation-levels?id=${ID}`, { headers:cookie ? { cookie } : {} }), env });
  return [game.status, levels.status];
}

async function coverStatus(coverMod, env, cookie = '') {
  const response = await coverMod.onRequestGet({
    request:new Request(`https://game-factory.test/api/creation-cover?id=${ID}`, { headers:cookie ? { cookie } : {} }),
    env,
  });
  return response;
}

async function main() {
  const gameMod = await import(path.join(GALLERY, 'functions/g/[id].js'));
  const levelsMod = await import(path.join(GALLERY, 'functions/api/creation-levels.js'));
  const coverMod = await import(path.join(GALLERY, 'functions/api/creation-cover.js'));
  const creationsMod = await import(path.join(GALLERY, 'functions/api/creations.js'));
  const creationActionsMod = await import(path.join(GALLERY, 'functions/api/me/creations.js'));
  const creationAdminMod = await import(path.join(GALLERY, 'functions/api/me/creation-admin.js'));
  const visibilityMod = await import(path.join(GALLERY, 'functions/_lib/creationVisibility.js'));
  const owner = await sessionCookie({ uid:'pit-owner', email:'pit@example.com' });
  const admin = await sessionCookie({ uid:'tim-admin', email:'tim-admin@example.com' });
  const other = await sessionCookie({ uid:'other-user', email:'other@example.com' });

  const unlistedEnv = makeEnv({ published:false }); // legacy record, no explicit visibility
  const matrix = {
    owner:await requestPair(gameMod, levelsMod, unlistedEnv, owner),
    admin:await requestPair(gameMod, levelsMod, unlistedEnv, admin),
    other:await requestPair(gameMod, levelsMod, unlistedEnv, other),
    operationalBearer:await requestPair(gameMod, levelsMod, unlistedEnv, '', { 'x-admin-token':'operator-bearer-token' }),
    anonymous:await requestPair(gameMod, levelsMod, unlistedEnv, ''),
    listedAnonymous:await requestPair(gameMod, levelsMod, makeEnv({ published:true, visibility:'listed' }), ''),
    explicitUnlisted:await requestPair(gameMod, levelsMod, makeEnv({ published:true, visibility:'unlisted' }), ''),
    disabledVisibility:await requestPair(gameMod, levelsMod, makeEnv({ visibility:'disabled' }), ''),
    disabledFlag:await requestPair(gameMod, levelsMod, makeEnv({ disabled:true }), ''),
    notLive:await requestPair(gameMod, levelsMod, makeEnv({ status:'rejected' }), ''),
    wrongSource:await requestPair(gameMod, levelsMod, makeEnv({ source:'community' }), ''),
    missingMetadata:await requestPair(gameMod, levelsMod, makeEnv({ includeUpload:false }), ''),
    missingBlob:await requestPair(gameMod, levelsMod, makeEnv({ includeBlob:false }), ''),
  };
  const expected = {
    owner:[200,200], admin:[200,200], other:[200,200], operationalBearer:[200,200], anonymous:[200,200],
    listedAnonymous:[200,200], explicitUnlisted:[200,200],
    disabledVisibility:[404,404], disabledFlag:[404,404], notLive:[404,404], wrongSource:[404,404], missingMetadata:[404,404], missingBlob:[404,404],
  };
  if (JSON.stringify(matrix) !== JSON.stringify(expected)) throw new Error(`access matrix mismatch: ${JSON.stringify(matrix)}`);

  const unlistedCover = await coverStatus(coverMod, unlistedEnv);
  const unrelatedCover = await coverStatus(coverMod, unlistedEnv, other);
  const missingMetadataCover = await coverStatus(coverMod, makeEnv({ includeUpload:false }));
  const disabledCover = await coverStatus(coverMod, makeEnv({ visibility:'disabled' }));
  if (unlistedCover.status !== 200 || unrelatedCover.status !== 200 || missingMetadataCover.status !== 404 || disabledCover.status !== 404) {
    throw new Error(`cover matrix mismatch: ${[unlistedCover.status, unrelatedCover.status, missingMetadataCover.status, disabledCover.status].join(',')}`);
  }
  if (!/no-store/.test(unlistedCover.headers.get('cache-control') || '')) throw new Error('unlisted cover survived a possible takedown transition');
  if (!/no-store/.test(missingMetadataCover.headers.get('cache-control') || '')) throw new Error('unavailable cover response was cacheable');

  const unlistedGame = await gameMod.onRequestGet({ request:new Request(`https://game-factory.test/g/${ID}`, { headers:{ 'sec-fetch-dest':'iframe' } }), env:unlistedEnv, params:{ id:ID } });
  const unlistedLevels = await levelsMod.onRequestGet({ request:new Request(`https://game-factory.test/api/creation-levels?id=${ID}`), env:unlistedEnv });
  if (!/no-store/.test(unlistedGame.headers.get('cache-control') || '')) throw new Error('unlisted game response was cacheable');
  if (!/no-store/.test(unlistedLevels.headers.get('cache-control') || '')) throw new Error('unlisted level response was cacheable');
  if (!/noindex/.test(unlistedGame.headers.get('x-robots-tag') || '')) throw new Error('unlisted raw game was indexable');

  const legacyUnlisted = { source:'vibe', status:'live', published:false };
  const listed = { source:'vibe', status:'live', published:true, visibility:'listed' };
  if (!visibilityMod.isPlayableStudioCreation(legacyUnlisted) || visibilityMod.isListedStudioCreation(legacyUnlisted)) throw new Error('legacy unlisted semantics regressed');
  if (!visibilityMod.isPlayableStudioCreation(listed) || !visibilityMod.isListedStudioCreation(listed)) throw new Error('listed semantics regressed');

  // Prove the complete state transition: list/unlist changes discovery while
  // the same anonymous runtime link remains available throughout.
  global.caches = { default:{ async match() { return null; }, async put() {} } };
  const toggleEnv = makeEnv({ published:false, visibility:'unlisted' });
  async function publicFeed() {
    const response = await creationsMod.onRequestGet({ env:toggleEnv });
    return response.json();
  }
  async function ownerAction(action) {
    const response = await creationActionsMod.onRequestPost({
      request:new Request('https://game-factory.test/api/me/creations', {
        method:'POST',
        headers:{ cookie:owner, origin:'https://game-factory.test', 'content-type':'application/json' },
        body:JSON.stringify({ id:ID, action }),
      }),
      env:toggleEnv,
    });
    return { status:response.status, body:await response.json() };
  }
  if ((await publicFeed()).creations.length !== 0) throw new Error('unlisted creation leaked into public feed');
  let actionResult = await ownerAction('publish');
  if (actionResult.status !== 200 || actionResult.body.visibility !== 'listed' || (await publicFeed()).creations.length !== 1) throw new Error('listing transition failed');
  if (JSON.stringify(await requestPair(gameMod, levelsMod, toggleEnv, '')) !== '[200,200]') throw new Error('listing transition broke direct link');
  actionResult = await ownerAction('unpublish');
  if (actionResult.status !== 200 || actionResult.body.visibility !== 'unlisted' || (await publicFeed()).creations.length !== 0) throw new Error('unlisting transition failed');
  if (JSON.stringify(await requestPair(gameMod, levelsMod, toggleEnv, '')) !== '[200,200]') throw new Error('unlisting revoked direct link');

  const disabledActionEnv = makeEnv({ visibility:'disabled' });
  const disabledPublish = await creationActionsMod.onRequestPost({
    request:new Request('https://game-factory.test/api/me/creations', {
      method:'POST',
      headers:{ cookie:owner, origin:'https://game-factory.test', 'content-type':'application/json' },
      body:JSON.stringify({ id:ID, action:'publish' }),
    }),
    env:disabledActionEnv,
  });
  if (disabledPublish.status !== 409) throw new Error('owner could override an explicit moderation takedown');

  const anonymousAdmin = await creationAdminMod.onRequestGet({ request:new Request(`https://game-factory.test/api/me/creation-admin?id=${ID}`), env:toggleEnv });
  const unrelatedAdmin = await creationAdminMod.onRequestGet({ request:new Request(`https://game-factory.test/api/me/creation-admin?id=${ID}`, { headers:{ cookie:other } }), env:toggleEnv });
  const ownerAdmin = await creationAdminMod.onRequestGet({ request:new Request(`https://game-factory.test/api/me/creation-admin?id=${ID}`, { headers:{ cookie:owner } }), env:toggleEnv });
  if (anonymousAdmin.status !== 401 || unrelatedAdmin.status !== 401 || ownerAdmin.status !== 200) {
    throw new Error(`editor access changed with play visibility: ${[anonymousAdmin.status, unrelatedAdmin.status, ownerAdmin.status].join(',')}`);
  }
  console.log('PASS Studio unlisted access:', JSON.stringify({ matrix, cover:[200,200,404,404] }));
}

main().catch((err) => {
  console.error('FAIL Studio unlisted access:', err.message);
  process.exit(1);
});
