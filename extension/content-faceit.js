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
      hint.textContent = 'DemoDrop: click "Watch demo" and it goes straight to your CS2 folder.';
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
