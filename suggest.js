// Suggest-a-game modal — shared wiring for both index.html (gallery) and
// play.html. The modal markup with id="suggest-modal" must exist in the
// host page; this script does the open/close/submit state machine via
// the shared `window.wireModal` helper (defined in Gallery/modal.js, which
// MUST be loaded before this file).
//
// HOST PAGE CONTRACT:
//   - <button id="footer-suggest-btn"> OR <button id="suggest-btn">
//   - <div id="suggest-modal"> containing form#suggest-modal-form,
//     textarea#suggest-modal-input, span#suggest-modal-counter,
//     button#suggest-modal-submit, div#suggest-modal-status
//   - Open/close toggles `.hidden` on the modal root
//
// The minimal inline version on /p/<slug> SSR share page is intentionally
// separate (different CSS scope, no shared stylesheet). Don't try to unify
// those three — see backlog "Improve-architecture pass on Gallery/style.css".

(function () {
  if (!window.wireModal) return;
  const btn = document.getElementById('footer-suggest-btn') || document.getElementById('suggest-btn');
  if (!btn) return;
  const fromPage = btn.id === 'suggest-btn' ? 'play' : 'gallery';

  window.wireModal({
    modalId:  'suggest-modal',
    triggerId: btn.id,
    formId:   'suggest-modal-form',
    inputId:  'suggest-modal-input',
    counterId:'suggest-modal-counter',
    submitId: 'suggest-modal-submit',
    statusId: 'suggest-modal-status',
    statusClass: 'suggest-modal-status',
    minLength: 3,
    labels: { idle: 'Send', sending: '…', sent: 'Sent' },
    successMessage: 'Thanks — Tim sees this tomorrow morning.',
    autoCloseMs: 1800,
    errorMessages: {
      daily_limit_reached: "You've sent 3 already today — come back tomorrow.",
      text_too_short:      'A bit more detail, please.',
      network:             'Network error — try again.',
      default:             "Couldn't send — try again.",
    },
    onOpen() {
      if (window.posthog) posthog.capture('suggest_modal_opened', { from: fromPage });
    },
    async onSubmit(text) {
      try {
        const r = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (r.ok) {
          if (window.posthog) posthog.capture('suggest_submitted', { from: fromPage, length: text.length });
          return { ok: true };
        }
        const data = await r.json().catch(() => ({}));
        return { ok: false, errorCode: data.error || 'default' };
      } catch (err) {
        return { ok: false, errorCode: 'network' };
      }
    },
  });
})();
