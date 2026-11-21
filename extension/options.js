const DEFAULTS = { targetDir: '', deleteArchive: true, catchSiteDownloads: true };
const $ = id => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('targetDir').value = s.targetDir;
  $('deleteArchive').checked = s.deleteArchive;
  $('catchSiteDownloads').checked = s.catchSiteDownloads;

  const reply = await chrome.runtime.sendMessage({ type: 'ping-host' });
  const status = $('status');
  if (reply?.ok) {
    status.className = 'ok';
    status.textContent = reply.defaultDir
      ? `Helper connected. Found CS2 at: ${reply.defaultDir}`
      : 'Helper connected, but it could not find CS2. Enter the folder below.';
  } else {
    status.className = 'bad';
    status.textContent = `Helper not reachable (${reply?.error || 'unknown error'}). Run install.ps1 from the DemoDropExtension folder, then reload this page.`;
  }
}

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    targetDir: $('targetDir').value.trim(),
    deleteArchive: $('deleteArchive').checked,
    catchSiteDownloads: $('catchSiteDownloads').checked
  });
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});

load();
