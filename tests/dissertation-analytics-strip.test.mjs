import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const middlewareSource = await readFile(
  new URL('../functions/_middleware.js', import.meta.url),
  'utf8',
);
const middlewareModule = await import(
  `data:text/javascript;base64,${Buffer.from(middlewareSource).toString('base64')}`
);
const { stripCloudflareAnalytics } = middlewareModule;


test('removes the Pages Analytics beacon observed in production', () => {
  const injected = [
    '<body><main>frozen game</main>',
    '<!-- Cloudflare Pages Analytics -->',
    "<script defer src='https://static.cloudflareinsights.com/beacon.min.js' ",
    "data-cf-beacon='{\"token\":\"example\"}'></script>",
    '<!-- Cloudflare Pages Analytics -->',
    '</body>',
  ].join('');
  assert.equal(
    stripCloudflareAnalytics(injected),
    '<body><main>frozen game</main></body>',
  );
});


test('removes the versioned Web Analytics beacon variant', () => {
  const injected = [
    '<body><main>study shell</main>',
    '<!-- Cloudflare Web Analytics -->',
    '<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v1234" ',
    'data-cf-beacon="{&quot;token&quot;:&quot;example&quot;}"></script>',
    '<!-- End Cloudflare Web Analytics -->',
    '</body>',
  ].join('');
  assert.equal(
    stripCloudflareAnalytics(injected),
    '<body><main>study shell</main></body>',
  );
});


test('preserves unmarked scripts and non-Cloudflare content', () => {
  const original = [
    '<body>',
    '<script src="/dissertation/study-bridge.js"></script>',
    '<script src="https://example.com/beacon.min.js"></script>',
    '</body>',
  ].join('');
  assert.equal(stripCloudflareAnalytics(original), original);
});
