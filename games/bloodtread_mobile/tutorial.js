// Minimal bloodtread tutorial (Tim 2026-07-01). Two NON-BLOCKING overlays, no gates, no menu wall:
//  1) INTRO drive hint on the very first run - one step: "drag to drive, cannon auto-fires" - clears on the first
//     real movement or after ~6s.
//  2) MENU guide after the first death - explains BLOODFORGE / GORE VAULT / START RUN so a new player knows what to
//     do next - clears on a single tap (routed from input.js).
// Seen-flags live in their own localStorage keys (they survive a meta-save wipe, so a returning player is not
// re-taught). Pure overlays: the game keeps running underneath; nothing here blocks input or the render loop.
import { hud } from './render/context.js?v=bm9';
import { view, state, player } from './state.js?v=bm9';
import { stats } from './persistence.js?v=bm9';

var INTRO_KEY = 'bloodtread_tut_intro', MENU_KEY = 'bloodtread_tut_menu';
var introSeen = false, menuSeen = false;
try { introSeen = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) {}
try { menuSeen = localStorage.getItem(MENU_KEY) === '1'; } catch (e) {}

function rr(x, y, w, h, r) { hud.beginPath(); hud.moveTo(x + r, y); hud.arcTo(x + w, y, x + w, y + h, r); hud.arcTo(x + w, y + h, x, y + h, r); hud.arcTo(x, y + h, x, y, r); hud.arcTo(x, y, x + w, y, r); hud.closePath(); }

// The MENU guide is active only after the player has finished (died in) at least one run and hasn't dismissed it.
export function tutMenuActive() { return !menuSeen && (stats.attempts | 0) > 0; }
export function markMenuSeen() { if (menuSeen) return; menuSeen = true; try { localStorage.setItem(MENU_KEY, '1'); } catch (e) {} }
function markIntroSeen() { if (introSeen) return; introSeen = true; try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {} }

// -- INTRO drive hint: drawn last in the PLAYING HUD (render/hud.js renderHud). The ONE step a new player needs. --
export function drawIntroHint() {
  if (introSeen) return;
  var moving = (player.vx * player.vx + player.vy * player.vy) > 3600;   // ~60 u/s => they figured out driving
  if (state.t > 6 || (moving && state.t > 1.2)) { markIntroSeen(); return; }
  var a = state.t < 0.4 ? state.t / 0.4 : 1;
  hud.save();
  hud.globalAlpha = a;
  hud.textAlign = 'center'; hud.textBaseline = 'middle';
  hud.shadowColor = 'rgba(0,0,0,0.9)'; hud.shadowBlur = 14;
  hud.fillStyle = '#fff';
  hud.font = '900 ' + Math.max(22, Math.min(34, view.cssW * 0.07)) + 'px sans-serif';
  hud.fillText('DRAG TO DRIVE', view.cssW * 0.5, view.cssH * 0.30);
  hud.font = Math.max(12, Math.min(17, view.cssW * 0.036)) + 'px sans-serif';
  hud.fillStyle = '#e9dcc7';
  hud.fillText('Your cannon auto-fires when enemies appear', view.cssW * 0.5, view.cssH * 0.30 + Math.max(28, view.cssH * 0.045));
  hud.shadowBlur = 0;
  // pulsing drag ring near where the joystick appears, so the hint points at the control
  var pr = Math.max(22, view.cssH * 0.045), px = view.cssW * 0.5, py = view.cssH * 0.66;
  var pulse = 0.5 + 0.5 * Math.sin(state.t * 4.2);
  hud.strokeStyle = 'rgba(255,255,255,' + (0.3 + 0.4 * pulse) + ')'; hud.lineWidth = 3;
  hud.beginPath(); hud.arc(px, py, pr * (0.8 + 0.35 * pulse), 0, Math.PI * 2); hud.stroke();
  hud.fillStyle = 'rgba(255,255,255,0.85)';
  hud.beginPath(); hud.arc(px, py, pr * 0.3, 0, Math.PI * 2); hud.fill();
  hud.restore();
}

// -- MENU guide: drawn last in drawMenu (ui/screens.js). Explains the base after the first death. Tap to dismiss. --
export function drawMenuGuide() {
  if (!tutMenuActive()) return;
  hud.save();
  hud.fillStyle = 'rgba(6,4,3,0.74)';
  hud.fillRect(0, 0, view.cssW, view.cssH);
  var lines = [
    ['START RUN', 'Dive back into the horde'],
    ['BLOODFORGE', 'Spend blood on permanent tank upgrades'],
    ['GORE VAULT', 'Open caches for gear, skins + relics']
  ];
  var lh = Math.max(46, Math.min(60, view.cssH * 0.082));
  var w = Math.min(420, view.cssW - 36), x = (view.cssW - w) * 0.5;
  var h = 96 + lines.length * lh + 40;
  var y = Math.max(18, (view.cssH - h) * 0.5);
  hud.fillStyle = '#160d0b'; rr(x, y, w, h, 14); hud.fill();
  hud.strokeStyle = '#e0402c'; hud.lineWidth = 2; rr(x, y, w, h, 14); hud.stroke();
  hud.textAlign = 'center'; hud.textBaseline = 'middle';
  hud.fillStyle = '#fff'; hud.font = '900 ' + Math.max(17, Math.min(23, view.cssW * 0.048)) + 'px sans-serif';
  hud.fillText('YOU FELL. THIS IS YOUR BASE', view.cssW * 0.5, y + 34);
  var ly = y + 82;
  for (var i = 0; i < lines.length; i++) {
    hud.textAlign = 'left';
    hud.fillStyle = '#ffb648'; hud.font = '800 ' + Math.max(14, Math.min(18, view.cssW * 0.04)) + 'px sans-serif';
    hud.fillText(lines[i][0], x + 22, ly);
    hud.fillStyle = '#e9dcc7'; hud.font = Math.max(11, Math.min(14, view.cssW * 0.03)) + 'px sans-serif';
    hud.fillText(lines[i][1], x + 22, ly + Math.max(19, lh * 0.4));
    ly += lh;
  }
  hud.textAlign = 'center';
  hud.fillStyle = '#54ff96'; hud.font = 'bold ' + Math.max(13, Math.min(17, view.cssW * 0.036)) + 'px sans-serif';
  hud.fillText('TAP TO CONTINUE', view.cssW * 0.5, y + h - 24);
  hud.restore();
}
