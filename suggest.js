// Suggest-a-game modal — shared wiring for both index.html (gallery) and
// play.html. The modal markup with id="suggest-modal" must exist in the
// host page; this script does the open/close/submit state machine.
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
  const m = document.getElementById('suggest-modal');
  const btn = document.getElementById('footer-suggest-btn') || document.getElementById('suggest-btn');
  if (!m || !btn) return;

  const input = document.getElementById('suggest-modal-input');
  const counter = document.getElementById('suggest-modal-counter');
  const submit = document.getElementById('suggest-modal-submit');
  const statusEl = document.getElementById('suggest-modal-status');
  const fromPage = btn.id === 'suggest-btn' ? 'play' : 'gallery';

  function open() {
    input.value = '';
    counter.textContent = '0 / 500';
    submit.disabled = true;
    submit.textContent = 'Send';
    statusEl.textContent = '';
    statusEl.className = 'suggest-modal-status';
    m.classList.remove('hidden');
    m.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 50);
    if (window.posthog) posthog.capture('suggest_modal_opened', { from: fromPage });
  }

  function close() {
    m.classList.add('hidden');
    m.setAttribute('aria-hidden', 'true');
  }

  btn.addEventListener('click', open);
  m.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.close) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !m.classList.contains('hidden')) close();
  });
  input.addEventListener('input', () => {
    const n = input.value.length;
    counter.textContent = `${n} / 500`;
    submit.disabled = n < 3;
  });

  document.getElementById('suggest-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, 500);
    if (text.length < 3) return;
    submit.disabled = true;
    submit.textContent = '…';
    statusEl.textContent = '';
    statusEl.className = 'suggest-modal-status';
    try {
      const r = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        statusEl.textContent = 'Thanks — Tim sees this tomorrow morning.';
        statusEl.className = 'suggest-modal-status ok';
        input.value = '';
        counter.textContent = '0 / 500';
        submit.textContent = 'Sent';
        if (window.posthog) posthog.capture('suggest_submitted', { from: fromPage, length: text.length });
        setTimeout(close, 1800);
      } else {
        const data = await r.json().catch(() => ({}));
        statusEl.textContent =
          data.error === 'daily_limit_reached' ? "You've sent 3 already today — come back tomorrow." :
          data.error === 'text_too_short' ? 'A bit more detail, please.' :
          "Couldn't send — try again.";
        statusEl.className = 'suggest-modal-status err';
        submit.textContent = 'Send';
        submit.disabled = input.value.length < 3;
      }
    } catch (err) {
      statusEl.textContent = 'Network error — try again.';
      statusEl.className = 'suggest-modal-status err';
      submit.textContent = 'Send';
      submit.disabled = input.value.length < 3;
    }
  });
})();
