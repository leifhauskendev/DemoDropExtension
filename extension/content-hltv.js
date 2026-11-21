// Adds a "Send to CS2" button next to HLTV's demo download link on match pages.

(function () {
  const demoEl = document.querySelector('[data-demo-link], a[href^="/download/demo/"]');
  if (!demoEl) return; // no demo for this match (yet)

  const path = demoEl.getAttribute('data-demo-link') || demoEl.getAttribute('href');
  const url = new URL(path, location.origin).href;

  // The archive name has no date, so tell the background worker the match date
  // for this demo link (used whichever download button is clicked).
  const unix = Number(document.querySelector('.timeAndEvent .date[data-unix]')?.dataset.unix);
  if (unix) chrome.runtime.sendMessage({ type: 'hltv-match', url, date: unix });

  // The logo's crosshair + download arrow, drawn in white for the button.
  const ICON = '<svg viewBox="0 0 128 128" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="64" cy="64" r="42" stroke-opacity=".6" stroke-width="9"/>' +
    '<path d="M64 8 V26 M64 102 V120 M8 64 H26 M102 64 H120" stroke-width="10"/>' +
    '<path d="M64 40 V74 M50 61 L64 75 L78 61 M46 86 H82" stroke-width="12"/></svg>';

  const btn = document.createElement('button');
  btn.className = 'demodrop-btn';
  const setLabel = text => { btn.innerHTML = ICON; btn.append(text); };
  setLabel('Send demo to CS2');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setLabel('Downloading…');
    const res = await chrome.runtime.sendMessage({ type: 'download', url });
    if (!res?.ok) {
      btn.disabled = false;
      setLabel('Couldn\'t start the download. Try again');
      btn.title = res?.error || '';
    }
  });

  demoEl.insertAdjacentElement('afterend', btn);
})();
