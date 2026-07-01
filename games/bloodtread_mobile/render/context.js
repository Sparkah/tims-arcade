// Canvas elements, the 2D HUD drawing context, AND the WebGL2 instance pipeline.
// The GL pipeline (context acquire -> programs -> VAO/buffers -> attribs -> uniforms -> grid -> GL state)
// runs at module-load in the SAME order it did when it lived at the top of the IIFE. `gl` may be null when
// webgl2 is unavailable: main.js checks `if (gl)` before booting (the old early-return) and the fallback
// element is shown here on the null path. The sprite-batch primitives + sprite-density grid live here too
// (they share the GL context + buffers); the texture/image LOADERS live in assets.js.
// This build's instance shader has a u_zoom uniform (the camera zoom); drawInstances feeds view.cameraZoom.
import {
  MAX_INST, INV_STRIDE, SPRITE_CELL, SPRITE_ANIM_CAP
} from '../config.js?v=bm3';
import { SPRITE_LOD } from '../flags.js?v=bm3';
import { player, view, sprites, enemies } from '../state.js?v=bm3';
import { perf } from '../core/time.js?v=bm3';
import { worldToScreenX, worldToScreenY } from './camera.js?v=bm3';

export var glCanvas = document.getElementById('gl');
export var hudCanvas = document.getElementById('hud');
export var fallback = document.getElementById('fallback');
export var hud = hudCanvas.getContext('2d', { alpha: true });

// -- WebGL2 context (may be null) --
export var gl = glCanvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false
});

// no-gl fallback: show the fallback element. main.js gates boot on `if (gl)`; everything below is
// guarded so module load never throws when gl is null (programs/buffers stay null, draws are no-ops).
if (!gl) {
  fallback.style.display = 'grid';
}

function compile(type, src) {
  var sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  }
  return sh;
}

// kept the (gl, ...) signature the call sites used, so the init block below reads identically to the original.
function makeProgram(gl, vsSrc, fsSrc) {
  var vs = compile(gl.VERTEX_SHADER, vsSrc);
  var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  var p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

// instance Float32Array hot path: shared with render/world (writes) + main.js. NEVER reallocated.
export var inst = new Float32Array(MAX_INST * INV_STRIDE);

var program = null, spriteProgram = null;
var vao = null, instBuf = null, spriteVao = null, spriteBuf = null;
var uCam = null, uView = null, uZoom = null, uSpriteRes = null, uSpriteTex = null;
var spriteBatches = Object.create(null);
var spriteActiveKeys = [];
var spriteGridCount = new Uint16Array(256);
var spriteGridAnim = new Uint16Array(256);
var spriteGridCols = 1;
var spriteGridRows = 1;

if (gl) {
  // -- instance program (procedural shapes; u_zoom applies the camera zoom) --
  program = makeProgram(gl, [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 a_unit;',
    'layout(location=1) in vec4 a_posSize;',
    'layout(location=2) in vec4 a_misc;',
    'layout(location=3) in vec4 a_col2;',
    'uniform vec2 u_cam;',
    'uniform vec2 u_view;',
    'uniform float u_zoom;',
    'out vec2 v_uv;',
    'out float v_shape;',
    'out vec4 v_color;',
    'out float v_pulse;',
    'void main() {',
    '  float c = cos(a_misc.x);',
    '  float s = sin(a_misc.x);',
    '  vec2 scaled = a_unit * a_posSize.zw;',
    '  vec2 rot = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);',
    '  vec2 css = (a_posSize.xy + rot - u_cam) * u_zoom + u_view * 0.5;',
    '  vec2 clip = css / u_view * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '  v_uv = a_unit;',
    '  v_shape = a_misc.y;',
    '  v_color = vec4(a_misc.z, a_misc.w, a_col2.x, a_col2.y);',
    '  v_pulse = a_col2.z;',
    '}'
  ].join('\n'), [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'in float v_shape;',
    'in vec4 v_color;',
    'in float v_pulse;',
    'out vec4 outColor;',
    'void main() {',
    '  float d;',
    '  if (v_shape < 0.5) {',
    '    d = length(v_uv);',
    '  } else if (v_shape < 1.5) {',
    '    d = max(abs(v_uv.x), abs(v_uv.y));',
    '  } else if (v_shape < 2.5) {',
    '    d = abs(v_uv.x) + abs(v_uv.y);',
    '  } else {',
    '    d = abs(length(v_uv) - 0.64) * 1.7;',
    '  }',
    '  float edge = smoothstep(1.0, 0.84, d);',
    '  if (edge <= 0.01) discard;',
    '  vec3 rgb = v_color.rgb + vec3(0.28, 0.06, 0.02) * v_pulse;',
    '  outColor = vec4(rgb, v_color.a * edge);',
    '}'
  ].join('\n'));

  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var unit = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, unit);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
  var strideBytes = INV_STRIDE * 4;
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, strideBytes, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, strideBytes, 32);
  gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  uCam = gl.getUniformLocation(program, 'u_cam');
  uView = gl.getUniformLocation(program, 'u_view');
  uZoom = gl.getUniformLocation(program, 'u_zoom');

  // -- sprite program (textured quads) --
  spriteProgram = makeProgram(gl, [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 a_pos;',
    'layout(location=1) in vec2 a_uv;',
    'layout(location=2) in vec4 a_col;',
    'uniform vec2 u_res;',
    'out vec2 v_uv;',
    'out vec4 v_col;',
    'void main() {',
    '  vec2 clip = a_pos / u_res * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '  v_uv = a_uv;',
    '  v_col = a_col;',
    '}'
  ].join('\n'), [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 v_uv;',
    'in vec4 v_col;',
    'uniform sampler2D u_tex;',
    'out vec4 outColor;',
    'void main() {',
    '  vec4 tex = texture(u_tex, v_uv);',
    '  if (tex.a < 0.02) discard;',
    '  outColor = tex * v_col;',
    '}'
  ].join('\n'));
  spriteVao = gl.createVertexArray();
  gl.bindVertexArray(spriteVao);
  spriteBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
  gl.bufferData(gl.ARRAY_BUFFER, 1024 * 8 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);
  uSpriteRes = gl.getUniformLocation(spriteProgram, 'u_res');
  uSpriteTex = gl.getUniformLocation(spriteProgram, 'u_tex');

  // -- GL state --
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

// -- texture upload (called by assets.js on each sprite-sheet decode) --
export function uploadSpriteTexture(img) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  return tex;
}

// -- instance builders (procedural-shape pipeline) --
export function addInst(n, x, y, sx, sy, angle, shape, r, g, b, a, pulse) {
  if (n >= MAX_INST) return n;
  var k = n * INV_STRIDE;
  inst[k] = x; inst[k + 1] = y; inst[k + 2] = sx; inst[k + 3] = sy;
  inst[k + 4] = angle; inst[k + 5] = shape; inst[k + 6] = r; inst[k + 7] = g;
  inst[k + 8] = b; inst[k + 9] = a; inst[k + 10] = pulse || 0; inst[k + 11] = 0;
  return n + 1;
}

export function addRot(n, ox, oy, sx, sy, angle, shape, r, g, b, a, pulse) {
  var ca = Math.cos(angle), sa = Math.sin(angle);
  return addInst(n, player.x + ox * ca - oy * sa, player.y + ox * sa + oy * ca, sx, sy, angle, shape, r, g, b, a, pulse);
}

export function addLineInst(n, x1, y1, x2, y2, width, r, g, b, a, pulse) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.5) return n;
  return addInst(n, (x1 + x2) * 0.5, (y1 + y2) * 0.5, len * 0.5, width * 0.5, Math.atan2(dy, dx), 1, r, g, b, a, pulse);
}

export function addCurveInst(n, x0, y0, cx0, cy0, x1, y1, width, r, g, b, a, pulse, segs) {
  var px0 = x0;
  var py0 = y0;
  segs = segs || 3;
  for (var s = 1; s <= segs; s++) {
    var t = s / segs;
    var it = 1 - t;
    var qx = it * it * x0 + 2 * it * t * cx0 + t * t * x1;
    var qy = it * it * y0 + 2 * it * t * cy0 + t * t * y1;
    n = addLineInst(n, px0, py0, qx, qy, width, r, g, b, a, pulse);
    px0 = qx;
    py0 = qy;
  }
  return n;
}

export function drawInstances(start, count) {
  if (count <= 0) return;
  gl.useProgram(program);
  gl.uniform2f(uCam, player.x, player.y);
  gl.uniform2f(uView, view.cssW, view.cssH);
  gl.uniform1f(uZoom, view.cameraZoom);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.subarray(start * INV_STRIDE, (start + count) * INV_STRIDE));
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  gl.bindVertexArray(null);
}

// -- sprite-batch primitives + sprite-density grid --
export function resetSpriteBatches() {
  for (var i = 0; i < spriteActiveKeys.length; i++) {
    spriteBatches[spriteActiveKeys[i]].floats = 0;
    spriteBatches[spriteActiveKeys[i]].verts = 0;
  }
  spriteActiveKeys.length = 0;
  perf.spriteDraws = 0;
  perf.spriteAnimated = 0;
  perf.spriteStatic = 0;
  perf.spriteCulled = 0;
  perf.envSprites = 0;
  perf.corpseSprites = 0;
  perf.tankSprites = 0;
}

export function spriteBatch(key) {
  if (!sprites.textures[key]) return null;
  var b = spriteBatches[key];
  if (!b) {
    b = { data: new Float32Array(6 * 8 * 96), floats: 0, verts: 0, active: false };
    spriteBatches[key] = b;
  }
  if (b.floats === 0) spriteActiveKeys.push(key);
  return b;
}

export function pushSpriteVertex(b, x, y, u, v, r, g, bl, a) {
  var k = b.floats;
  if (k + 8 > b.data.length) {
    var grown = new Float32Array(b.data.length * 2);
    grown.set(b.data);
    b.data = grown;
  }
  var data = b.data;
  data[k] = x; data[k + 1] = y; data[k + 2] = u; data[k + 3] = v;
  data[k + 4] = r; data[k + 5] = g; data[k + 6] = bl; data[k + 7] = a;
  b.floats = k + 8;
  b.verts++;
}

export function queueSprite(key, sx, sy, sw, sh, x, y, w, h, r, g, bl, a) {
  var meta = sprites.meta[key];
  var batch = spriteBatch(key);
  if (!meta || !batch) return false;
  var u0 = sx / meta.w;
  var v0 = sy / meta.h;
  var u1 = (sx + sw) / meta.w;
  var v1 = (sy + sh) / meta.h;
  var x0 = x, y0 = y, x1 = x + w, y1 = y + h;
  pushSpriteVertex(batch, x0, y0, u0, v0, r, g, bl, a);
  pushSpriteVertex(batch, x1, y0, u1, v0, r, g, bl, a);
  pushSpriteVertex(batch, x0, y1, u0, v1, r, g, bl, a);
  pushSpriteVertex(batch, x0, y1, u0, v1, r, g, bl, a);
  pushSpriteVertex(batch, x1, y0, u1, v0, r, g, bl, a);
  pushSpriteVertex(batch, x1, y1, u1, v1, r, g, bl, a);
  return true;
}

export function queueSpriteRot(key, sx, sy, sw, sh, cx0, cy0, w, h, angle, r, g, bl, a) {
  var meta = sprites.meta[key];
  var batch = spriteBatch(key);
  if (!meta || !batch) return false;
  var u0 = sx / meta.w;
  var v0 = sy / meta.h;
  var u1 = (sx + sw) / meta.w;
  var v1 = (sy + sh) / meta.h;
  var hw = w * 0.5, hh = h * 0.5;
  var ca = Math.cos(angle), sa = Math.sin(angle);
  var x0 = -hw, y0 = -hh, x1 = hw, y1 = -hh, x2 = -hw, y2 = hh, x3 = hw, y3 = hh;
  var p0x = cx0 + x0 * ca - y0 * sa, p0y = cy0 + x0 * sa + y0 * ca;
  var p1x = cx0 + x1 * ca - y1 * sa, p1y = cy0 + x1 * sa + y1 * ca;
  var p2x = cx0 + x2 * ca - y2 * sa, p2y = cy0 + x2 * sa + y2 * ca;
  var p3x = cx0 + x3 * ca - y3 * sa, p3y = cy0 + x3 * sa + y3 * ca;
  pushSpriteVertex(batch, p0x, p0y, u0, v0, r, g, bl, a);
  pushSpriteVertex(batch, p1x, p1y, u1, v0, r, g, bl, a);
  pushSpriteVertex(batch, p2x, p2y, u0, v1, r, g, bl, a);
  pushSpriteVertex(batch, p2x, p2y, u0, v1, r, g, bl, a);
  pushSpriteVertex(batch, p1x, p1y, u1, v0, r, g, bl, a);
  pushSpriteVertex(batch, p3x, p3y, u1, v1, r, g, bl, a);
  return true;
}

export function flushSprites() {
  if (!spriteActiveKeys.length) return;
  gl.useProgram(spriteProgram);
  gl.uniform2f(uSpriteRes, view.cssW, view.cssH);
  gl.uniform1i(uSpriteTex, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(spriteVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
  for (var i = 0; i < spriteActiveKeys.length; i++) {
    var key = spriteActiveKeys[i];
    var b = spriteBatches[key];
    if (!b || b.verts <= 0) continue;
    gl.bindTexture(gl.TEXTURE_2D, sprites.textures[key]);
    gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, b.floats), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, b.verts);
    perf.spriteDraws++;
  }
  gl.bindVertexArray(null);
}

export function ensureSpriteGrid() {
  spriteGridCols = Math.max(1, Math.ceil((view.cssW + 360) / SPRITE_CELL));
  spriteGridRows = Math.max(1, Math.ceil((view.cssH + 360) / SPRITE_CELL));
  var need = spriteGridCols * spriteGridRows;
  if (spriteGridCount.length < need) {
    spriteGridCount = new Uint16Array(need);
    spriteGridAnim = new Uint16Array(need);
  }
  spriteGridCount.fill(0, 0, need);
  spriteGridAnim.fill(0, 0, need);
}

export function spriteCellIndex(x, y) {
  var sx = worldToScreenX(x) + 180;
  var sy = worldToScreenY(y) + 180;
  if (sx < 0 || sy < 0) return -1;
  var cx = (sx / SPRITE_CELL) | 0;
  var cy = (sy / SPRITE_CELL) | 0;
  if (cx < 0 || cy < 0 || cx >= spriteGridCols || cy >= spriteGridRows) return -1;
  return cy * spriteGridCols + cx;
}

export function prepareSpriteDensity() {
  ensureSpriteGrid();
  for (var i = 0; i < enemies.count; i++) {
    var cell = spriteCellIndex(enemies.x[i], enemies.y[i]);
    if (cell >= 0) spriteGridCount[cell]++;
    else perf.spriteCulled++;
  }
}

export function spriteDir(face) {
  return ((Math.round(2 - face * 4 / Math.PI) % 8) + 8) % 8;
}

// the sprite-density grid read by queueOldEnemySprite (render/world): per-cell enemy count + animated budget.
// Exported as accessor fns because spriteGridCount/Anim are reallocated by ensureSpriteGrid (a fresh typed
// array on growth), so a bare `export var` binding would go stale on the consumer side after a reallocation.
export function spriteGridCountAt(cell) { return spriteGridCount[cell]; }
export function spriteGridAnimAt(cell) { return spriteGridAnim[cell]; }
export function bumpSpriteGridAnim(cell) { spriteGridAnim[cell]++; }
