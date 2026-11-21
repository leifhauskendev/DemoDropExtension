const DEFAULTS = { targetDir: '', deleteArchive: true, catchSiteDownloads: true, refragImport: 'off' };
const $ = id => document.getElementById(id);

const IMPORT_HINTS = {
  off: 'FACEIT demos only go to your CS2 folder.',
  ask: 'The "demos ready" pop-up gets an Import to Refrag button.',
  always: 'Every FACEIT demo is uploaded to Refrag right away.'
};

function setStatus(el, textEl, state, text) {
  el.dataset.state = state;
  textEl.textContent = text;
}

async function load() {
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  const s = await chrome.storage.sync.get(DEFAULTS);
  $('targetDir').value = s.targetDir;
  $('deleteArchive').checked = s.deleteArchive;
  $('catchSiteDownloads').checked = s.catchSiteDownloads;
  const radio = document.querySelector(`input[name="refragImport"][value="${s.refragImport}"]`);
  if (radio) radio.checked = true;
  $('refragImportHint').textContent = IMPORT_HINTS[s.refragImport] || '';

  loadRefrag();

  const reply = await chrome.runtime.sendMessage({ type: 'ping-host' });
  if (reply?.ok) {
    setStatus($('status'), $('statusText'), 'ok', reply.defaultDir
      ? `Helper connected · CS2 found at ${reply.defaultDir}`
      : 'Helper connected, but CS2 wasn\'t found. Enter the folder below.');
    if (reply.defaultDir) $('targetDir').placeholder = reply.defaultDir;
  } else {
    setStatus($('status'), $('statusText'), 'bad',
      `Helper not reachable (${reply?.error || 'unknown error'}). Run the DemoDrop installer again, then reload this page.`);
  }
}

async function loadRefrag() {
  const user = await chrome.runtime.sendMessage({ type: 'refrag-user' });
  setStatus($('refragStatus'), $('refragText'), user ? 'ok' : 'wait',
    user ? `Signed in as ${user.name}` : 'Not signed in');
  $('refragSignIn').hidden = !!user;
  $('refragSignOut').hidden = !user;
}

// ---------- saving ----------

let savedTimer;
async function save() {
  const checked = document.querySelector('input[name="refragImport"]:checked');
  const refragImport = checked ? checked.value : 'off';
  await chrome.storage.sync.set({
    targetDir: $('targetDir').value.trim(),
    deleteArchive: $('deleteArchive').checked,
    catchSiteDownloads: $('catchSiteDownloads').checked,
    refragImport
  });
  $('refragImportHint').textContent = IMPORT_HINTS[refragImport];
  $('saved').classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $('saved').classList.remove('show'), 1400);
}

let typingTimer;
$('targetDir').addEventListener('input', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(save, 500);
});
for (const id of ['deleteArchive', 'catchSiteDownloads']) $(id).addEventListener('change', save);
document.querySelectorAll('input[name="refragImport"]').forEach(r => r.addEventListener('change', save));

// ---------- Refrag account ----------

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

load();
