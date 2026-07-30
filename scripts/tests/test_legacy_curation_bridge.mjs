import assert from 'node:assert/strict';

import { onRequestPost } from '../../functions/api/admin/hidden.js';

const URL = 'https://game-factory.tech/api/admin/hidden';

function request(body = JSON.stringify({ slug: 'visible_arcade', hide: true })) {
  return new Request(URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body,
  });
}

function envWith(get, put = async () => {}) {
  return {
    ADMIN_TOKEN: 'test-token',
    VOTES: { get, put },
  };
}

// A deferred request body must not observe the write lock until parsing ends.
const stream = new TransformStream();
const writer = stream.writable.getWriter();
let slowLockReads = 0;
const slowEnv = envWith(async key => {
  if (key === 'curation:legacy-write-enabled') {
    slowLockReads += 1;
    return '0';
  }
  return ['hidden_game'];
});
const slowRequest = new Request(URL, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-admin-token': 'test-token',
  },
  body: stream.readable,
  duplex: 'half',
});
const slowResponsePromise = onRequestPost({ request: slowRequest, env: slowEnv });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(slowLockReads, 0);
await writer.write(new TextEncoder().encode('{"slug":"visible_arcade","hide":true}'));
await writer.close();
assert.equal((await slowResponsePromise).status, 503);
assert.equal(slowLockReads, 1);

// A lock that closes during the hidden-set read must be rechecked before put.
let lockReads = 0;
let puts = 0;
const closingEnv = envWith(async key => {
  if (key === 'curation:legacy-write-enabled') {
    lockReads += 1;
    return lockReads === 1 ? '1' : '0';
  }
  return ['hidden_game'];
}, async () => { puts += 1; });
assert.equal((await onRequestPost({
  request: request(),
  env: closingEnv,
})).status, 503);
assert.equal(lockReads, 2);
assert.equal(puts, 0);

// Missing/malformed/read-failed hidden state must never collapse to [] + slug.
for (const broken of [
  async key => key === 'curation:legacy-write-enabled' ? '1' : null,
  async key => key === 'curation:legacy-write-enabled' ? '1' : ['Bad Slug'],
  async key => {
    if (key === 'curation:legacy-write-enabled') return '1';
    throw new Error('KV unavailable');
  },
]) {
  let brokenPuts = 0;
  const response = await onRequestPost({
    request: request(),
    env: envWith(broken, async () => { brokenPuts += 1; }),
  });
  assert.equal(response.status, 503);
  assert.equal(brokenPuts, 0);
}

const openHidden = ['hidden_game'];
let openPut = null;
const openResponse = await onRequestPost({
  request: request(),
  env: envWith(
    async key => key === 'curation:legacy-write-enabled' ? '1' : openHidden,
    async (key, value) => { openPut = [key, value]; },
  ),
});
assert.equal(openResponse.status, 200);
assert.deepEqual(openPut, [
  'hidden:set',
  JSON.stringify(['hidden_game', 'visible_arcade']),
]);

console.log('legacy curation bridge: PASS');
