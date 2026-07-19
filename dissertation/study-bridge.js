(() => {
  "use strict";

  let firstInputSent = false;
  const loadToken = new URLSearchParams(window.location.search).get("studyLoad");

  function send(type, inputMethod) {
    window.parent.postMessage(
      {
        source: "dissertation-game",
        type,
        inputMethod,
        loadToken,
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
  if (document.readyState === "complete") {
    send("ready", "unknown");
  } else {
    window.addEventListener("load", () => send("ready", "unknown"), { once: true });
  }
})();
