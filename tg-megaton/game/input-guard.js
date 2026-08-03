(function () {
  'use strict';

  // Keep right-click and long-press inside the canvas experience. The paired
  // CSS disables the iOS callout; these listeners cover browser menus, text
  // selection, and native drag gestures.
  ['contextmenu', 'selectstart', 'dragstart'].forEach(function (eventName) {
    document.addEventListener(eventName, function (event) {
      event.preventDefault();
    }, { passive: false });
  });
})();
