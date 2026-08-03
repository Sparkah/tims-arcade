export function safeAssetId(id) {
  return String(id || '').replace(/[^a-z0-9_]/gi, '');
}

export function cleanAssetId(id) {
  return safeAssetId(id).replace(/_[0-9]{3}$/, '');
}

export function hexColor(hex, fallback) {
  hex = typeof hex === 'string' ? hex.trim() : '';
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
}

export function mixHex(a, b, t) {
  a = hexColor(a, '#ffffff');
  b = hexColor(b, '#ffffff');
  t = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + (0x1000000 + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

export function rgba(hex, alpha) {
  hex = hexColor(hex, '#ffffff');
  const value = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + alpha + ')';
}

export function darken(hex, factor) {
  const value = parseInt(hex.slice(1), 16);
  const k = 1 + factor;
  const red = Math.max(0, Math.min(255, ((value >> 16) & 255) * k | 0));
  const green = Math.max(0, Math.min(255, ((value >> 8) & 255) * k | 0));
  const blue = Math.max(0, Math.min(255, (value & 255) * k | 0));
  return 'rgb(' + red + ',' + green + ',' + blue + ')';
}

export function mixRgb(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

export function formatCompact(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return '' + n;
}
