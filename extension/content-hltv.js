// Adds a "Send to CS2" button next to HLTV's demo download link on match pages.

(function () {
  const demoEl = document.querySelector('[data-demo-link], a[href^="/download/demo/"]');
  if (!demoEl) return; // no demo for this match (yet)

  const path = demoEl.getAttribute('data-demo-link') || demoEl.getAttribute('href');
  const url = new URL(path, location.origin).href;

  const btn = document.createElement('button');
  btn.className = 'demodrop-btn';
  btn.textContent = '⬇ Send demo to CS2';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Downloading… (see Chrome downloads)';
    const res = await chrome.runtime.sendMessage({ type: 'download', url });
    if (!res?.ok) {
      btn.disabled = false;
      btn.textContent = '⬇ Send demo to CS2';
      alert('DemoDrop: download could not start. ' + (res?.error || ''));
    }
  });

  demoEl.insertAdjacentElement('afterend', btn);
})();
