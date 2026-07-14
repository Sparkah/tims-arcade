// Private reference-image handling for trusted Studio Creator jobs.
//
// The browser sends one canvas-normalized PNG/JPEG/WebP alongside the text
// prompt. Keep the pixels OUT of genjob records: long Studio Max builds rewrite
// those records on every heartbeat. Only small metadata lives on the job, while
// the opaque binary is stored under the unguessable job id and is available only
// through the relay-authenticated endpoint.

export const REFERENCE_IMAGE_TTL = 60 * 60 * 24 * 7;  // retry window is five days
export const MAX_REFERENCE_IMAGE_BYTES = 2 * 1024 * 1024;
export const MIN_REFERENCE_IMAGE_BYTES = 32;
export const MAX_REFERENCE_IMAGE_EDGE = 2000;
export const MAX_REFERENCE_IMAGE_PIXELS = 4 * 1000 * 1000;

const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function referenceImageKey(jobId) {
  return `genref:${jobId}`;
}

export async function validateReferenceImage(file) {
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return { ok: false, error: 'image_missing', status: 400 };
  }
  const mime = String(file.type || '').toLowerCase();
  if (!MIME_TYPES.has(mime)) return { ok: false, error: 'image_type', status: 400 };
  const declaredSize = Number(file.size) || 0;
  if (declaredSize < MIN_REFERENCE_IMAGE_BYTES) return { ok: false, error: 'image_too_small', status: 400 };
  if (declaredSize > MAX_REFERENCE_IMAGE_BYTES) return { ok: false, error: 'image_too_large', status: 413 };

  let bytes;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { return { ok: false, error: 'image_unreadable', status: 400 }; }
  if (bytes.byteLength !== declaredSize || bytes.byteLength < MIN_REFERENCE_IMAGE_BYTES) {
    return { ok: false, error: 'image_unreadable', status: 400 };
  }
  if (bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) return { ok: false, error: 'image_too_large', status: 413 };
  if (!referenceMagicMatches(bytes, mime)) return { ok: false, error: 'image_mismatch', status: 400 };
  const dimensions = referenceImageDimensions(bytes, mime);
  if (!dimensions) return { ok: false, error: 'image_unreadable', status: 400 };
  if (dimensions.width > MAX_REFERENCE_IMAGE_EDGE || dimensions.height > MAX_REFERENCE_IMAGE_EDGE
      || dimensions.width * dimensions.height > MAX_REFERENCE_IMAGE_PIXELS) {
    return { ok: false, error: 'image_dimensions', status: 413 };
  }

  return {
    ok: true,
    bytes,
    metadata: { mime, sizeBytes: bytes.byteLength, width: dimensions.width, height: dimensions.height },
  };
}

export function referenceMagicMatches(bytes, mime) {
  if (!bytes || bytes.length < 12) return false;
  if (mime === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
      && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
  }
  if (mime === 'image/jpeg') {
    return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  }
  if (mime === 'image/webp') {
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

export function referenceImageDimensions(bytes, mime) {
  if (!referenceMagicMatches(bytes, mime)) return null;
  if (mime === 'image/png') {
    let offset = 8;
    let dimensions = null;
    let sawIdat = false;
    let idatBytes = 0;
    let sawIend = false;
    let chunkIndex = 0;
    while (offset + 12 <= bytes.length) {
      const length = readU32BE(bytes, offset);
      const typeStart = offset + 4;
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const chunkEnd = dataEnd + 4;
      if (!Number.isSafeInteger(dataEnd) || chunkEnd > bytes.length) return null;
      const type = String.fromCharCode(bytes[typeStart], bytes[typeStart + 1], bytes[typeStart + 2], bytes[typeStart + 3]);
      if (pngCrc32(bytes, typeStart, dataEnd) !== readU32BE(bytes, dataEnd)) return null;
      if (chunkIndex === 0) {
        if (type !== 'IHDR' || length !== 13) return null;
        dimensions = validDimensions(readU32BE(bytes, dataStart), readU32BE(bytes, dataStart + 4));
        if (!dimensions) return null;
        const bitDepth = bytes[dataStart + 8];
        const colorType = bytes[dataStart + 9];
        const validDepths = colorType === 0 ? [1, 2, 4, 8, 16]
          : (colorType === 2 ? [8, 16]
            : (colorType === 3 ? [1, 2, 4, 8]
              : ((colorType === 4 || colorType === 6) ? [8, 16] : [])));
        if (!validDepths.includes(bitDepth) || bytes[dataStart + 10] !== 0
            || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] > 1) return null;
      } else if (type === 'IHDR') {
        return null;
      }
      if (type === 'IDAT') { sawIdat = true; idatBytes += length; }
      if (type === 'IEND') {
        if (length !== 0) return null;
        sawIend = true;
        offset = chunkEnd;
        break;
      }
      offset = chunkEnd;
      chunkIndex++;
    }
    return dimensions && sawIdat && idatBytes > 0 && sawIend && offset === bytes.length ? dimensions : null;
  }
  if (mime === 'image/jpeg') {
    const sofMarkers = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);
    let offset = 2;
    let dimensions = null;
    let sawScan = false;
    let sawSof = false;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xFF) return null;
      while (offset < bytes.length && bytes[offset] === 0xFF) offset++;
      const marker = bytes[offset++];
      if (marker === 0xD9) break;
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) continue;
      if (offset + 1 >= bytes.length) return null;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return null;
      if (sofMarkers.has(marker)) {
        if (sawSof || length < 11) return null;
        const components = bytes[offset + 7];
        if (components < 1 || components > 4 || length !== 8 + 3 * components
            || (bytes[offset + 2] !== 8 && bytes[offset + 2] !== 12)) return null;
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        dimensions = validDimensions(width, height);
        if (!dimensions) return null;
        sawSof = true;
      }
      if (marker === 0xDA) {
        const scanComponents = bytes[offset + 2];
        if (!sawSof || scanComponents < 1 || scanComponents > 4
            || length !== 6 + 2 * scanComponents || offset + length >= bytes.length - 2) return null;
        sawScan = true;
        break;
      }
      offset += length;
    }
    const hasEoi = bytes.length >= 4 && bytes[bytes.length - 2] === 0xFF && bytes[bytes.length - 1] === 0xD9;
    return dimensions && sawScan && hasEoi ? dimensions : null;
  }
  if (mime === 'image/webp') {
    if (bytes.length < 30 || readU32LE(bytes, 4) + 8 !== bytes.length) return null;
    let offset = 12;
    let canvasDimensions = null;
    let pixelDimensions = null;
    let sawPixelChunk = false;
    while (offset + 8 <= bytes.length) {
      const type = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const length = readU32LE(bytes, offset + 4);
      const dataStart = offset + 8;
      const chunkEnd = dataStart + length;
      const paddedEnd = chunkEnd + (length & 1);
      if (!Number.isSafeInteger(chunkEnd) || paddedEnd > bytes.length) return null;
      if (type === 'VP8X') {
        if (canvasDimensions || length !== 10) return null;
        canvasDimensions = validDimensions(1 + readU24LE(bytes, dataStart + 4), 1 + readU24LE(bytes, dataStart + 7));
        if (!canvasDimensions) return null;
      } else if (type === 'ANIM' || type === 'ANMF') {
        // Canvas normalization always emits one static image; reject animation
        // so frame dimensions cannot disagree with the validated canvas.
        return null;
      } else if (type === 'VP8L' && length >= 5 && bytes[dataStart] === 0x2F) {
        if (sawPixelChunk) return null;
        pixelDimensions = validDimensions(
          1 + (bytes[dataStart + 1] | ((bytes[dataStart + 2] & 0x3F) << 8)),
          1 + ((bytes[dataStart + 2] >> 6) | (bytes[dataStart + 3] << 2) | ((bytes[dataStart + 4] & 0x0F) << 10)),
        );
        sawPixelChunk = !!pixelDimensions;
      } else if (type === 'VP8 ' && length >= 10
          && bytes[dataStart + 3] === 0x9D && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2A) {
        if (sawPixelChunk) return null;
        pixelDimensions = validDimensions(
          (bytes[dataStart + 6] | (bytes[dataStart + 7] << 8)) & 0x3FFF,
          (bytes[dataStart + 8] | (bytes[dataStart + 9] << 8)) & 0x3FFF,
        );
        sawPixelChunk = !!pixelDimensions;
      }
      offset = paddedEnd;
    }
    if (!sawPixelChunk || !pixelDimensions || offset !== bytes.length) return null;
    if (canvasDimensions && (canvasDimensions.width !== pixelDimensions.width || canvasDimensions.height !== pixelDimensions.height)) return null;
    return canvasDimensions || pixelDimensions;
  }
  return null;
}

function readU32BE(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readU24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readU32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] * 0x1000000)) >>> 0;
}

function pngCrc32(bytes, start, end) {
  let crc = 0xFFFFFFFF;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function validDimensions(width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

export async function storeReferenceImage(env, jobId, image) {
  await env.VOTES.put(referenceImageKey(jobId), image.bytes, { expirationTtl: REFERENCE_IMAGE_TTL });
}

export async function deleteReferenceImage(env, jobRec) {
  if (!jobRec || !jobRec.referenceImage || !jobRec.id) return;
  try { await env.VOTES.delete(referenceImageKey(jobRec.id)); } catch { /* TTL is the cleanup backstop */ }
}
