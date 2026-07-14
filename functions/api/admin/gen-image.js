// GET /api/admin/gen-image?id=<jobId>
//
// Relay-only download for a private Studio job's optional reference image. The
// browser never receives this endpoint's authorization, and the response never
// includes the owner, prompt, filename, or a reusable storage key.

import { requireRelay } from '../../_lib/adminAuth.js';
import {
  MAX_REFERENCE_IMAGE_BYTES,
  MIN_REFERENCE_IMAGE_BYTES,
  referenceImageKey,
  referenceImageDimensions,
  referenceMagicMatches,
} from '../../_lib/genReferenceImage.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

export async function onRequestGet({ request, env }) {
  const guard = await requireRelay(request, env);
  if (guard) return guard;

  const id = String(new URL(request.url).searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return error('bad_id', 400);

  const job = await env.VOTES.get(`genjob:${id}`, 'json');
  if (!job || job.generatorLane !== 'trusted-codex' || !job.referenceImage) {
    return error('not_found', 404);
  }
  if (job.status !== 'pending' && job.status !== 'building') return error('not_found', 404);

  const metadata = job.referenceImage;
  const mime = String(metadata.mime || '').toLowerCase();
  const expectedSize = Math.floor(Number(metadata.sizeBytes) || 0);
  if (expectedSize < MIN_REFERENCE_IMAGE_BYTES || expectedSize > MAX_REFERENCE_IMAGE_BYTES) {
    return error('reference_unavailable', 409);
  }

  const buffer = await env.VOTES.get(referenceImageKey(id), { type: 'arrayBuffer' });
  if (!buffer) return error('reference_unavailable', 409);
  const bytes = new Uint8Array(buffer);
  const dimensions = referenceImageDimensions(bytes, mime);
  if (bytes.byteLength !== expectedSize || !referenceMagicMatches(bytes, mime)
      || !dimensions || dimensions.width !== Number(metadata.width) || dimensions.height !== Number(metadata.height)) {
    return error('reference_unavailable', 409);
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': mime,
      'content-length': String(bytes.byteLength),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function error(code, status) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
