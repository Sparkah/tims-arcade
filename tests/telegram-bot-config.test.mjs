import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TELEGRAM_BOT_CONFIG_KEY,
  normalizeTelegramBotConfig,
  readTelegramBotConfig,
  writeTelegramBotConfig,
} from '../functions/_lib/telegramBotConfig.js';
import { mutationHostAllowed } from '../functions/api/admin/telegram-bot.js';

class FakeKv {
  constructor(value = null) {
    this.value = value;
    this.failReads = false;
    this.puts = [];
  }

  async get(key, type) {
    assert.equal(key, TELEGRAM_BOT_CONFIG_KEY);
    if (this.failReads) throw new Error('kv_unavailable');
    if (type === 'json') return this.value ? structuredClone(this.value) : null;
    return this.value ? JSON.stringify(this.value) : null;
  }

  async put(key, value) {
    assert.equal(key, TELEGRAM_BOT_CONFIG_KEY);
    this.value = JSON.parse(value);
    this.puts.push(this.value);
  }
}

test('normalization keeps a full catalogue worth of include and exclude choices', () => {
  const slugs = Array.from({ length: 260 }, (_, index) => `game_${index + 1}`);
  const config = normalizeTelegramBotConfig({
    library: { includeSlugs: slugs, excludeSlugs: slugs },
  });
  assert.equal(config.library.includeSlugs.length, 260);
  assert.equal(config.library.excludeSlugs.length, 260);
});

test('strict reads fail closed while ordinary runtime reads retain their fallback', async () => {
  const kv = new FakeKv();
  kv.failReads = true;
  await assert.rejects(() => readTelegramBotConfig({ VOTES: kv }, { strict: true }), /kv_unavailable/);
  const fallback = await readTelegramBotConfig({ VOTES: kv });
  assert.equal(fallback.version, 1);
  assert.equal(fallback.library.mode, 'all');
});

test('a matching expected version saves and increments the version', async () => {
  const kv = new FakeKv({ version: 7, library: { mode: 'all', excludeSlugs: ['old_game'] } });
  const saved = await writeTelegramBotConfig(
    { VOTES: kv },
    { library: { mode: 'selected', includeSlugs: ['new_game'] } },
    { expectedVersion: 7 },
  );
  assert.equal(saved.version, 8);
  assert.equal(saved.library.mode, 'selected');
  assert.deepEqual(saved.library.includeSlugs, ['new_game']);
  assert.equal(kv.puts.length, 1);
});

test('a stale admin tab cannot overwrite a newer Telegram configuration', async () => {
  const kv = new FakeKv({ version: 9, library: { mode: 'all', excludeSlugs: ['keep_hidden'] } });
  await assert.rejects(
    () => writeTelegramBotConfig(
      { VOTES: kv },
      { library: { mode: 'all', excludeSlugs: [] } },
      { expectedVersion: 8 },
    ),
    (error) => error && error.message === 'telegram_bot_config_conflict' && error.status === 409,
  );
  assert.equal(kv.puts.length, 0);
  assert.deepEqual(kv.value.library.excludeSlugs, ['keep_hidden']);
});

test('selected mode intentionally supports an empty Telegram library', async () => {
  const sources = await Promise.all([
    readFile(new URL('../functions/api/tg-webhook.js', import.meta.url), 'utf8'),
    readFile(new URL('../tg/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../disc-arcade/sync_disc.mjs', import.meta.url), 'utf8'),
  ]);
  for (const source of sources) {
    assert.match(source, /mode\s*===\s*['"]selected['"]/);
    assert.doesNotMatch(source, /mode\s*===\s*['"]selected['"][^\n{]*includeSlugs\.length/);
  }
});

test('Telegram mutations are blocked on Pages preview hosts', () => {
  assert.equal(mutationHostAllowed(new Request('https://game-factory.tech/api/admin/telegram-bot')), true);
  assert.equal(mutationHostAllowed(new Request('http://localhost/api/admin/telegram-bot')), true);
  assert.equal(mutationHostAllowed(new Request('https://feature-branch.gallery.pages.dev/api/admin/telegram-bot')), false);
});

test('Telegram launch links use the current Mini App cache version everywhere available', async (t) => {
  const webhook = await readFile(new URL('../functions/api/tg-webhook.js', import.meta.url), 'utf8');
  const match = webhook.match(/TG_LIBRARY_VERSION\s*=\s*'([^']+)'/);
  assert.ok(match);
  assert.equal(match[1], '20260801-library-v3');

  const pollerPath = process.env.TELEGRAM_POLLER_PATH;
  if (!pollerPath) {
    t.diagnostic('Set TELEGRAM_POLLER_PATH to verify the separately deployed long-poll bot.');
    return;
  }
  const poller = await readFile(pollerPath, 'utf8');
  const pollerMatch = poller.match(/TG_LIBRARY_VERSION\s*=\s*'([^']+)'/);
  assert.ok(pollerMatch);
  assert.equal(pollerMatch[1], match[1]);
});
