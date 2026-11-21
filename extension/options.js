const DEFAULTS = { targetDir: '', deleteArchive: true, catchSiteDownloads: true, refragImport: 'off' };
const $ = id => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('targetDir').value = s.targetDir;
  $('deleteArchive').checked = s.deleteArchive;
  $('catchSiteDownloads').checked = s.catchSiteDownloads;
  $('refragImport').value = s.refragImport;

  loadRefrag();

  const reply = await chrome.runtime.sendMessage({ type: 'ping-host' });
  const status = $('status');
  if (reply?.ok) {
    status.className = 'ok';
    status.textContent = reply.defaultDir
      ? `Helper connected. Found CS2 at: ${reply.defaultDir}`
      : 'Helper connected, but it could not find CS2. Enter the folder below.';
  } else {
    status.className = 'bad';
    status.textContent = `Helper not reachable (${reply?.error || 'unknown error'}). Run the DemoDrop installer again, then reload this page.`;
  }
}

async function loadRefrag() {
  const user = await chrome.runtime.sendMessage({ type: 'refrag-user' });
  const status = $('refragStatus');
  status.className = user ? 'refrag ok' : 'refrag';
  status.textContent = user
    ? `Signed in to Refrag as ${user.name}.`
    : 'Not signed in to Refrag.';
  $('refragSignIn').hidden = !!user;
  $('refragSignOut').hidden = !user;
}

$('refragSignIn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://play.refrag.gg/login' });
});

$('refragSignOut').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'refrag-sign-out' });
  loadRefrag();
});

// Pick up a sign-in that happens in another tab.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.refragSession) loadRefrag();
});

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    targetDir: $('targetDir').value.trim(),
    deleteArchive: $('deleteArchive').checked,
    catchSiteDownloads: $('catchSiteDownloads').checked,
    refragImport: $('refragImport').value
  });
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});

load();
