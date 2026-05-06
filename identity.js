// identity.js — anon UUID cookie for visitor identity.
//
// Loaded on every gallery page. Sets a `uid` cookie on first visit; the
// browser sends it automatically with same-origin /api/* requests.
//
// Today the server doesn't enforce per-UUID anything — this is the
// foundation. The full auth layer (email magic-link / GitHub OAuth) will
// build on top: anonymous visitors can play but voting is gated to logged-in
// users; the anon UID still tracks "you played this" lists for engagement
// without requiring login.
//
// Cookie lifetime: 2 years. Cleared by user via browser settings.
// Fingerprintable? No — random UUID, no behavioural data attached client-side.

(function() {
  'use strict';

  function readCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(prefix) === 0) return c.slice(prefix.length);
    }
    return '';
  }

  function setCookie(name, value, days) {
    var expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + value +
                      '; expires=' + expires.toUTCString() +
                      '; path=/' +
                      '; SameSite=Lax';
  }

  function newUuid() {
    // Prefer crypto.randomUUID (available in modern browsers + secure contexts).
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    // Fallback for older browsers — RFC 4122 v4
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function(c) {
      return (c ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (c / 4)).toString(16);
    });
  }

  var uid = readCookie('uid');
  if (!uid) {
    uid = newUuid();
    setCookie('uid', uid, 730); // 2 years
  }

  // Expose for scripts that want to display "you" badges or track engagement
  window.IDENTITY = { uid: uid };
})();
