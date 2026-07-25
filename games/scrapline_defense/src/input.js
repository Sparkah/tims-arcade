export function setupInput(canvas, handlers) {
  let activePointerId = null;

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / height)),
      clientX: event.clientX,
      clientY: event.clientY
    };
  }

  function prevent(event) {
    event.preventDefault();
  }

  function onPointerDown(event) {
    event.preventDefault();
    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    handlers.onPointerDown(pointFromEvent(event));
  }

  function onPointerMove(event) {
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    event.preventDefault();
    handlers.onPointerMove(pointFromEvent(event));
  }

  function onPointerUp(event) {
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    event.preventDefault();
    handlers.onPointerUp(pointFromEvent(event));
    if (activePointerId !== null) {
      try {
        canvas.releasePointerCapture(activePointerId);
      } catch (_) {}
    }
    activePointerId = null;
  }

  function onKeyDown(event) {
    handlers.onKeyDown(event);
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
  canvas.addEventListener("contextmenu", prevent, { passive: false });
  document.addEventListener("contextmenu", prevent, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  return function disposeInput() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("contextmenu", prevent);
    document.removeEventListener("contextmenu", prevent);
    window.removeEventListener("keydown", onKeyDown);
  };
}
