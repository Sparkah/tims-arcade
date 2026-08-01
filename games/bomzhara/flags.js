// Runtime flags / URL query toggles. SPRITE_LOD is read by the reused context.js.
export var qs = new URLSearchParams(location.search);
export var SPRITE_LOD = false;        // procedural build draws no sprite atlas
export var NO_SHAKE = qs.has('noshake');
