// Dependency-free ZIP inspection for UGC upload validation.
//
// Reads the ZIP central directory to enumerate entry names + declared sizes
// WITHOUT decompressing anything — so there is zero zip-bomb exposure (we never
// inflate attacker-controlled data; the raw zip is stored inert and the deep
// behavioral vetting is the sandboxed review pipeline's job). This is the cheap
// structural gate at the door: root index.html, relative paths, allowed
// filetypes, sane file count + declared size.
//
// Pure JS (DataView/TextDecoder) so it runs in the no-build Cloudflare Functions
// bundle — the Gallery has no package.json and no npm deps on purpose.
//
// Reused by functions/api/upload.js and (later) the static-scan step.

const EOCD_SIG = 0x06054b50; // End of Central Directory
const CDH_SIG = 0x02014b50;  // Central Directory File Header
const MAX_COMMENT = 0xffff;

export class ZipError extends Error {}

// Generous allowlist covering web + 2D/3D game assets. Default-deny: anything
// not listed is rejected at upload (server/script types, archives, binaries).
// Editable — widen it when a legit community game needs a new asset type.
export const ALLOWED_EXT = new Set([
  // web
  'html', 'htm', 'js', 'mjs', 'css', 'json', 'map', 'txt', 'xml', 'csv', 'wasm',
  // emscripten / asm.js runtime artifact — static memory image emitted by
  // AppGameKit / Unity / older Emscripten HTML5 exports (inert binary blob,
  // same class as .bin/.data/.wasm; the game won't boot without it).
  'mem',
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'cur',
  // audio / video
  'mp3', 'ogg', 'wav', 'm4a', 'aac', 'opus', 'mp4', 'webm', 'oga',
  // fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // 3D + game data
  'glb', 'gltf', 'obj', 'mtl', 'fbx', 'bin', 'atlas', 'fnt', 'dat', 'data',
  'skel', 'tmx', 'tsx', 'lua', 'cfg', 'pck', 'shader', 'vert', 'frag', 'glsl',
]);

// Returns [{ name, compressedSize, uncompressedSize, method }] from the central
// directory. Throws ZipError on a malformed / unsupported archive.
export function listZipEntries(bytes, { maxEntries = 5000 } = {}) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const n = bytes.length;
  if (n < 22) throw new ZipError('zip_truncated');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, n);

  // Locate EOCD by scanning back over the (optional) trailing comment.
  let eocd = -1;
  const scanFloor = Math.max(0, n - 22 - MAX_COMMENT);
  for (let i = n - 22; i >= scanFloor; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('eocd_not_found');

  const totalEntries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  // ZIP64 sentinels — out of scope for small community web builds.
  if (totalEntries === 0xffff || cdOffset === 0xffffffff)
    throw new ZipError('zip64_unsupported');
  if (totalEntries > maxEntries) throw new ZipError('too_many_entries');

  const dec = new TextDecoder('utf-8', { fatal: false });
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > n || dv.getUint32(p, true) !== CDH_SIG)
      throw new ZipError('bad_central_dir');
    const versionMadeBy = dv.getUint16(p + 4, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const uncompressedSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const externalAttr = dv.getUint32(p + 38, true);
    if (p + 46 + nameLen > n) throw new ZipError('bad_central_dir');
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // hostOS 3 = Unix: the high 16 bits of externalAttr carry st_mode (used to
    // detect symlinks). Other hosts don't encode symlinks here, so a standard
    // extractor treats their entries as regular files regardless.
    entries.push({ name, compressedSize, uncompressedSize, method, hostOS: versionMadeBy >> 8, externalAttr });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function isUnsafeName(name) {
  return (
    name.startsWith('/') ||              // absolute
    name.includes('\\') ||               // backslash path
    /^[a-zA-Z]:/.test(name) ||           // drive letter
    name.split('/').some((seg) => seg === '..') || // traversal
    name.includes('\0')                  // null byte
  );
}

function extOf(name) {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

// Structural validation for an uploaded game zip. Returns
// { ok:true, fileCount, declaredBytes } or { ok:false, error, detail }.
export function validateGameZip(entries, { maxUncompressed = 300 * 1024 * 1024 } = {}) {
  let hasRootIndex = false;
  let declaredBytes = 0;
  let fileCount = 0;
  for (const e of entries) {
    if (e.name.endsWith('/')) continue; // directory entry
    fileCount++;
    if (isUnsafeName(e.name)) return { ok: false, error: 'unsafe_path', detail: e.name };
    // Reject symlinks + special files (device/fifo/socket). On Unix-made zips
    // (hostOS 3) the external-attr high 16 bits are st_mode; S_IFLNK = 0xA000.
    // A symlink entry would point a future unpack/deploy step at an arbitrary
    // path (e.g. /etc/passwd), so it must never reach the holding area.
    if (e.hostOS === 3) {
      const ftype = (e.externalAttr >>> 16) & 0xf000;
      if (ftype === 0xa000) return { ok: false, error: 'symlink_entry', detail: e.name };
      if (ftype && ftype !== 0x8000 && ftype !== 0x4000)
        return { ok: false, error: 'special_entry', detail: e.name };
    }
    if (e.name.toLowerCase() === 'index.html') hasRootIndex = true;
    const ext = extOf(e.name);
    if (!ALLOWED_EXT.has(ext))
      return { ok: false, error: 'disallowed_filetype', detail: e.name };
    declaredBytes += e.uncompressedSize;
  }
  if (fileCount === 0) return { ok: false, error: 'empty_archive' };
  if (!hasRootIndex) return { ok: false, error: 'no_root_index' };
  if (declaredBytes > maxUncompressed) return { ok: false, error: 'uncompressed_too_large' };
  return { ok: true, fileCount, declaredBytes };
}
