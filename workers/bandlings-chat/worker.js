import { onRequestGet, onRequestOptions, onRequestPost } from '../../functions/api/bandlings-chat.js';

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') return onRequestOptions();
    if (method === 'GET') return onRequestGet({ request, env });
    if (method === 'POST') return onRequestPost({ request, env });
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  },
};
