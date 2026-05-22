// Shared modal wiring — open/close/escape/backdrop/char-counter/submit
// state-machine that's identical between the comment modal (app.js) and
// the suggest-a-game modal (suggest.js). Loaded on both index.html and
// play.html so suggest.js (which runs on play.html without app.js) has it.
//
// Exposed on window so call sites don't need ESM import boilerplate.
//
// HOST PAGE CONTRACT — each modal must expose these DOM ids:
//   <div id="<modalId>">                  the modal root (toggle .hidden + aria-hidden)
//     <form id="<formId>">                the submit-event source
//       <textarea id="<inputId>">         the input
//       <span    id="<counterId>">        char counter, format "N / max"
//       <button  id="<submitId>">         the submit button
//   <div id="<statusId>">                 optional status line (ok/err classes)
//   <[any]    id="<triggerId>">           optional open-trigger button
//   Anywhere in the modal tree, `data-close="1"` on a child = backdrop/close
//
// Returns { open, close } so external code can drive the modal.
//
// Backlog item: "Consolidate modal IIFEs in app.js" (resolved 2026-05-22).
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
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 50);
    if (opts.onOpen) opts.onOpen();
  }

  function close() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (opts.onClose) opts.onClose();
  }

  // Optional trigger button opens the modal on click.
  if (opts.triggerId) {
    const btn = document.getElementById(opts.triggerId);
    if (btn) btn.addEventListener('click', open);
  }

  // Backdrop close: any descendant with data-close="1" calls close().
  modal.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.close) close();
  });

  // Escape closes only when this modal is the one visible.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
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
        // Keep modal open for another action; revert button label after a beat
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
