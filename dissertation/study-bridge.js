(() => {
  "use strict";

  let firstInputSent = false;

  function send(type, inputMethod) {
    window.parent.postMessage(
      {
        source: "dissertation-game",
        type,
        inputMethod,
      },
      "*",
    );
  }

  function firstInput(inputMethod) {
    if (firstInputSent) return;
    firstInputSent = true;
    send("first-input", inputMethod);
  }

  window.addEventListener(
    "pointerdown",
    (event) => firstInput(event.pointerType === "touch" ? "touch" : "mouse-or-trackpad"),
    { capture: true, passive: true },
  );
  window.addEventListener(
    "keydown",
    () => firstInput("keyboard"),
    { capture: true, passive: true },
  );
  send("ready", "unknown");
})();
