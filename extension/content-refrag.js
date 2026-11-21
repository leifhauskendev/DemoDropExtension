// Runs on play.refrag.gg. Refrag keeps its login in this page's storage, so
// this hands the current session to DemoDrop whenever it changes: signing in or
// out on Refrag signs DemoDrop in or out too. Passwords are never involved.

(function () {
  function readSession() {
    const token = sessionStorage.getItem('auth_token_default') || localStorage.getItem('auth_token_default');
    if (!token) return null;
    return { token, teamId: localStorage.getItem('activeTeamId') || null };
  }

  let last;
  function sync() {
    const session = readSession();
    const key = JSON.stringify(session);
    if (key === last) return;
    last = key;
    chrome.runtime.sendMessage({ type: 'refrag-session', session }).catch(() => {});
  }

  sync();
  // Refrag logs in and out without reloading the page, so keep checking.
  setInterval(sync, 3000);
})();
