#!/usr/bin/env node
/** Private creation access must match for the game iframe and level payload. */

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

function makeEnv(published) {
  const upload = { id:ID, uid:'pit-owner', source:'vibe', published:!!published, slug:'coldscale-6cc3' };
  const store = new Map([
    [`upload:${ID}`, JSON.stringify(upload)],
    [`genblob:${ID}`, '<!DOCTYPE html><html><body>game</body></html>'],
    [`creation-levels:${ID}`, JSON.stringify({ schema:'game-factory-generic-levels-v1', source:'embedded-seed', levels:[{ name:'One', width:360, height:640, player:{x:20,y:560}, goal:{x:320,y:80}, objects:[] }] })],
  ]);
  return {
    AUTH_SECRET,
    ADMIN_EMAILS:'tim-admin@example.com',
    ADMIN_TOKEN:'operator-bearer-token',
    VOTES:{
      async get(key, type) {
        const value = store.get(key);
        if (value == null) return null;
        return type === 'json' ? JSON.parse(value) : value;
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

async function main() {
  const gameMod = await import(path.join(GALLERY, 'functions/g/[id].js'));
  const levelsMod = await import(path.join(GALLERY, 'functions/api/creation-levels.js'));
  const owner = await sessionCookie({ uid:'pit-owner', email:'pit@example.com' });
  const admin = await sessionCookie({ uid:'tim-admin', email:'tim-admin@example.com' });
  const other = await sessionCookie({ uid:'other-user', email:'other@example.com' });

  const privateEnv = makeEnv(false);
  const matrix = {
    owner:await requestPair(gameMod, levelsMod, privateEnv, owner),
    admin:await requestPair(gameMod, levelsMod, privateEnv, admin),
    other:await requestPair(gameMod, levelsMod, privateEnv, other),
    operationalBearer:await requestPair(gameMod, levelsMod, privateEnv, '', { 'x-admin-token':'operator-bearer-token' }),
    anonymous:await requestPair(gameMod, levelsMod, privateEnv, ''),
    publishedAnonymous:await requestPair(gameMod, levelsMod, makeEnv(true), ''),
  };
  const expected = { owner:[200,200], admin:[200,200], other:[404,404], operationalBearer:[404,404], anonymous:[404,404], publishedAnonymous:[200,200] };
  if (JSON.stringify(matrix) !== JSON.stringify(expected)) throw new Error(`access matrix mismatch: ${JSON.stringify(matrix)}`);

  const adminHeaders = { cookie:admin, 'sec-fetch-dest':'iframe' };
  const adminGame = await gameMod.onRequestGet({ request:new Request(`https://game-factory.test/g/${ID}`, { headers:adminHeaders }), env:privateEnv, params:{ id:ID } });
  const adminLevels = await levelsMod.onRequestGet({ request:new Request(`https://game-factory.test/api/creation-levels?id=${ID}`, { headers:{ cookie:admin } }), env:privateEnv });
  const deniedLevels = await levelsMod.onRequestGet({ request:new Request(`https://game-factory.test/api/creation-levels?id=${ID}`), env:privateEnv });
  if (!/no-store/.test(adminGame.headers.get('cache-control') || '')) throw new Error('private game response was cacheable');
  if (!/no-store/.test(adminLevels.headers.get('cache-control') || '')) throw new Error('private level response was cacheable');
  if (!/no-store/.test(deniedLevels.headers.get('cache-control') || '')) throw new Error('denied level response was cacheable');
  console.log('PASS creation access:', JSON.stringify(matrix));
}

main().catch((err) => {
  console.error('FAIL creation access:', err.message);
  process.exit(1);
});
