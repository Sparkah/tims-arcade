// creations.js -- renders the public "Player Creations" shelf on the gallery home
// from /api/creations (games players generated and chose to publish). Self-contained,
// runs on load; hides the shelf when there are none. Tim 2026-06-15.
(function () {
  'use strict';
  var shelf = document.getElementById('creations-shelf');
  var grid = document.getElementById('creations-grid');
  if (!shelf || !grid) return;

  fetch('/api/creations', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.creations || !d.creations.length) return;
      grid.innerHTML = '';
      d.creations.forEach(function (c) {
        var a = document.createElement('a');
        a.className = 'creation-card';
        a.href = '/cplay?id=' + encodeURIComponent(c.id) +
                 '&slug=' + encodeURIComponent(c.slug || '') +
                 '&title=' + encodeURIComponent(c.title || '') +
                 '&by=' + encodeURIComponent(c.author || '');
        var cov = document.createElement('span');
        cov.className = 'creation-cover';
        if (c.hasCover) cov.style.backgroundImage = "url('/api/creation-cover?id=" + c.id + "')";
        var info = document.createElement('div');
        info.className = 'creation-info';
        var nm = document.createElement('div');
        nm.className = 'creation-name';
        nm.textContent = c.title || 'Untitled';
        var by = document.createElement('div');
        by.className = 'creation-by';
        by.textContent = 'by ' + (c.author || 'player') + ' · ' + (c.plays || 0) + ' plays';
        info.appendChild(nm); info.appendChild(by);
        a.appendChild(cov); a.appendChild(info);
        grid.appendChild(a);
      });
      shelf.hidden = false;
    })
    .catch(function () {});
})();
