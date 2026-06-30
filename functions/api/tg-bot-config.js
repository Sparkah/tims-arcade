import { publicTelegramBotConfig, readTelegramBotConfig } from '../_lib/telegramBotConfig.js';
import { json } from '../_lib/response.js';

export async function onRequestGet({ env }) {
  const config = publicTelegramBotConfig(await readTelegramBotConfig(env));
  return json(config, 200, {
    'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
  });
}
