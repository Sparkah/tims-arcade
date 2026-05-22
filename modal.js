// Shared modal wiring — opens a native <dialog> with showModal(), wires
// char-counter + submit state machine. Open/close/escape/backdrop/focus-trap
// are handled by the platform via <dialog closedby="any"> + showModal().
// Safari (no closedby support as of mid-2026) gets a 15-line click-coordinate
// fallback below.
//
// Migration history: until 2026-05-22 this hand-rolled ~70 lines of
// escape/backdrop/aria-hidden plumbing. Replaced with native <dialog>
// per Google Modern Web Guidance §light-dismiss-a-dialog.
//
// HOST PAGE CONTRACT — each modal must expose these DOM ids:
//   <dialog id="<modalId>" closedby="any" aria-labelledby="...">
//     <form id="<formId>">
//       <textarea id="<inputId>">
//       <span    id="<counterId>">   char counter, format "N / max"
//       <button  id="<submitId>">    submit button
//   <[any] id="<statusId>">         optional status line (ok/err classes)
//   <[any] id="<triggerId>">        optional open-trigger button
//   Anywhere inside, data-close="1" on a child = manual close button (the X)
//
// Returns { open, close } for external callers.
window.wireModal = function wireModal(opts) {
  const modal = document.getElementById(opts.modalId);
  if (!modal) return null;
  const input    = document.getElementById(opts.inputId);
  const counter  = document.getElementById(opts.counterId);
  const submit   = document.getElementById(opts.submitId);
  const form     = document.getElementById(opts.formId);
  const statusEl = opts.statusId ? document.getElementById(opts.statusId) : null;
  if (!input || !counter || !submit || !form) return null;

  const minLength       = opts.minLength || 2;
  const maxLength       = opts.maxLength || 500;
  const labels          = Object.assign({ idle: 'Send', sending: '…', sent: 'Sent' }, opts.labels || {});
  const statusBaseClass = opts.statusClass || '';
  const errorMessages   = opts.errorMessages || {};
  const clearOnSuccess  = opts.clearOnSuccess !== false;

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = statusBaseClass + (kind ? ' ' + kind : '');
  }

  function refreshSubmitDisabled() {
    submit.disabled = input.value.length < minLength;
  }

  function open() {
    input.value = '';
    counter.textContent = `0 / ${maxLength}`;
    submit.disabled = true;
    submit.textContent = labels.idle;
    setStatus('');
    modal.showModal();
    setTimeout(() => input.focus(), 50);
    if (opts.onOpen) opts.onOpen();
  }

  function close() {
    if (modal.open) modal.close();
  }

  // Optional trigger button opens the modal on click.
  if (opts.triggerId) {
    const btn = document.getElementById(opts.triggerId);
    if (btn) btn.addEventListener('click', open);
  }

  // The X button uses data-close="1"; clicking it (or any data-close descendant) closes the dialog.
  // Escape, backdrop-click, and mobile-back-gesture are handled by the browser via closedby="any".
  modal.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.close) modal.close();
  });

  // Safari fallback for closedby (not yet supported as of 2026).
  // Detects backdrop clicks via coordinate check; Esc still works natively.
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return; // only the dialog element itself
      const r = modal.getBoundingClientRect();
      const inside = e.clientY >= r.top && e.clientY <= r.bottom &&
                     e.clientX >= r.left && e.clientX <= r.right;
      if (!inside) modal.close();
    });
  }

  // Browser fires 'close' for every dismissal path — Esc, X, backdrop, modal.close().
  // Single hook for cleanup.
  modal.addEventListener('close', () => {
    if (opts.onClose) opts.onClose();
  });

  // Char counter + submit-disabled state on input.
  input.addEventListener('input', () => {
    counter.textContent = `${input.value.length} / ${maxLength}`;
    refreshSubmitDisabled();
  });

  // Submit state machine: disable → sending → (success → reset/autoClose) | (error → revert)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, maxLength);
    if (text.length < minLength) return;
    submit.disabled = true;
    submit.textContent = labels.sending;
    setStatus('');

    let result;
    try {
      result = await opts.onSubmit(text);
    } catch (err) {
      result = { ok: false, errorCode: 'network' };
    }

    if (result && result.ok) {
      if (opts.successMessage) setStatus(opts.successMessage, 'ok');
      submit.textContent = labels.sent;
      if (clearOnSuccess) {
        input.value = '';
        counter.textContent = `0 / ${maxLength}`;
      }
      if (opts.onSuccess) opts.onSuccess(text);
      if (opts.autoCloseMs) {
        setTimeout(close, opts.autoCloseMs);
      } else {
        // Keep modal open for another action; revert button label after a beat.
        setTimeout(() => {
          submit.textContent = labels.idle;
          refreshSubmitDisabled();
        }, 600);
      }
    } else {
      const code = (result && result.errorCode) || 'unknown';
      const msg  = errorMessages[code]
                || (result && result.message)
                || errorMessages.default
                || "Couldn't send — try again.";
      setStatus(msg, 'err');
      submit.textContent = labels.idle;
      refreshSubmitDisabled();
    }
  });

  return { open, close };
};
