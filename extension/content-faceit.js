// FACEIT only hands out demo links to logged-in users through its own
// "Watch demo" button, so we let the site do that and catch the download in the
// background worker. Here we just show a hint on match room pages.

(function () {
  const HINT_ID = 'demodrop-faceit-hint';

  function update() {
    const onRoom = /\/cs2\/room\/[^/]+/.test(location.pathname);
    const existing = document.getElementById(HINT_ID);
    if (onRoom && !existing) {
      const hint = document.createElement('div');
      hint.id = HINT_ID;
      hint.className = 'demodrop-hint';
      // The DemoDrop logo (pastel tile, crosshair + download arrow).
      hint.innerHTML = '<svg viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="demodrop-tile" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#7f9cf5"/><stop offset="1" stop-color="#9f86e8"/></linearGradient></defs>' +
        '<rect width="128" height="128" rx="30" fill="url(#demodrop-tile)"/>' +
        '<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="64" cy="64" r="42" stroke-opacity=".55" stroke-width="5"/>' +
        '<path d="M64 12 V26 M64 102 V116 M12 64 H26 M102 64 H116" stroke-width="6"/>' +
        '<path d="M64 40 V74 M50 61 L64 75 L78 61 M46 86 H82" stroke-width="9"/></g></svg>' +
        '<span><b>DemoDrop</b> is ready. Click "Watch demo" and it goes straight to your CS2 folder.</span>';
      hint.addEventListener('click', () => hint.remove());
      document.body.appendChild(hint);
      setTimeout(() => hint.remove(), 8000);
    } else if (!onRoom && existing) {
      existing.remove();
    }
  }

  // FACEIT is a single-page app: watch for in-app navigation.
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname !== last) {
      last = location.pathname;
      update();
    }
  }, 1000);
  update();
})();
