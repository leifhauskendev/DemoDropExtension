// DemoDrop background worker.
// Spots demo downloads from HLTV / FACEIT, files them under Downloads\DemoDrop,
// then hands the finished file to the native helper, which unpacks it and moves
// the .dem files into the CS2 folder.

const HOST_NAME = 'com.leifhauskendev.demodrop';
const DOWNLOAD_SUBDIR = 'DemoDrop';

const DEFAULT_SETTINGS = {
  targetDir: '',          // empty = let the helper find CS2's game\csgo folder
  deleteArchive: true,    // remove the downloaded archive after unpacking
  catchSiteDownloads: true // also handle demos started with the site's own buttons
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

// ---------- recognising demo downloads ----------

function demoSource(item) {
  for (const raw of [item.finalUrl, item.url]) {
    if (!raw) continue;
    let u;
    try { u = new URL(raw); } catch { continue; }
    const host = u.hostname;
    if (host === 'r2-demos.hltv.org' || (host.endsWith('hltv.org') && u.pathname.startsWith('/download/demo/'))) {
      return 'hltv';
    }
    // Signed FACEIT links look like
    // https://demos-us-east-faceit-cdn.s3.us-east-005.backblazeb2.com/cs2/1-<match>-1-1.dem.zst?X-Amz-...
    const faceitHost = host.endsWith('faceit-cdn.net') || (host.includes('faceit') && host.endsWith('backblazeb2.com'));
    if (faceitHost && /\.dem(\.zst|\.gz)?$/i.test(u.pathname)) {
      return 'faceit';
    }
  }
  return null;
}

// Download ids we own survive worker restarts via session storage.
async function trackDownload(id, info) {
  const { tracked = {} } = await chrome.storage.session.get('tracked');
  tracked[id] = info;
  await chrome.storage.session.set({ tracked });
}

async function untrackDownload(id) {
  const { tracked = {} } = await chrome.storage.session.get('tracked');
  const info = tracked[id];
  delete tracked[id];
  await chrome.storage.session.set({ tracked });
  return info;
}

// URLs queued by our own "Send to CS2" button, so they're handled even when
// catchSiteDownloads is off. Matched by URL because onDeterminingFilename can
// fire before downloads.download() hands back the id.
const requestedUrls = new Set();

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const source = demoSource(item);
  if (!source) return; // not ours: Chrome keeps its default name

  getSettings().then(async settings => {
    const requested = requestedUrls.delete(item.url);
    if (!settings.catchSiteDownloads && !requested) {
      suggest();
      return;
    }
    const name = item.filename.split(/[\\/]/).pop();
    const { hltvDates = {} } = await chrome.storage.session.get('hltvDates');
    await trackDownload(item.id, { source, url: item.finalUrl || item.url, date: hltvDates[item.url] || null });
    setBadge('…');
    suggest({ filename: `${DOWNLOAD_SUBDIR}/${name}`, conflictAction: 'uniquify' });
  });
  return true; // we call suggest asynchronously
});

chrome.downloads.onChanged.addListener(async delta => {
  if (!delta.state) return;
  const state = delta.state.current;
  if (state !== 'complete' && state !== 'interrupted') return;

  const info = await untrackDownload(delta.id);
  if (!info) return;

  if (state === 'interrupted') {
    setBadge('');
    notify('Demo download failed', 'The download was interrupted. Try again from the match page.');
    return;
  }

  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  await processDownload(item.filename, info);
});

// ---------- handing off to the native helper ----------

async function faceitName(filePath) {
  // FACEIT files look like 1-<match uuid>-<map number>-<part>.dem.zst
  const base = filePath.split(/[\\/]/).pop();
  const m = base.match(/^(1-[0-9a-f-]{36})-(\d+)-(\d+)\.dem/i);
  if (!m) return null;
  const [, matchId, mapNo] = m;
  try {
    const res = await fetch(`https://www.faceit.com/api/match/v2/match/${matchId}`);
    const { payload } = await res.json();
    // Matchmaking teams are called team_<captain>; keep just the captain.
    const team = f => payload?.teams?.[f]?.name?.replace(/^team_/i, '');
    const t1 = team('faction1');
    const t2 = team('faction2');
    const picks = payload?.voting?.map?.pick || [];
    const map = picks[Number(mapNo) - 1] || picks[0] || '';
    const date = formatDate(payload?.startedAt || payload?.finishedAt);
    const parts = ['faceit', t1, 'vs', t2, map, matchId.slice(2, 10), date].filter(Boolean);
    return sanitize(parts.join('_')) + '.dem';
  } catch {
    return null; // keep FACEIT's own name if the lookup fails
  }
}

// YYYY-MM-DD in local time, from a timestamp (ms) or ISO string.
function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sanitize(s) {
  return s.replace(/[^a-z0-9_\-.]+/gi, '-').replace(/-+/g, '-');
}

function sendToHost(message) {
  // A port (rather than sendNativeMessage) keeps the worker alive while big
  // archives are unpacked.
  return new Promise(resolve => {
    let port;
    try {
      port = chrome.runtime.connectNative(HOST_NAME);
    } catch (e) {
      resolve({ ok: false, error: e.message });
      return;
    }
    let done = false;
    port.onMessage.addListener(reply => {
      if (reply.type === 'progress') return;
      done = true;
      resolve(reply);
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      if (!done) {
        const err = chrome.runtime.lastError?.message || 'Helper closed unexpectedly';
        resolve({ ok: false, error: err });
      }
    });
    port.postMessage(message);
  });
}

async function processDownload(filePath, info) {
  const settings = await getSettings();
  setBadge('⇣');
  const outputName = info.source === 'faceit' ? await faceitName(filePath) : null;

  const reply = await sendToHost({
    type: 'process',
    file: filePath,
    outputName,
    dateSuffix: info.source === 'hltv' ? formatDate(info.date) : null,
    targetDir: settings.targetDir || null,
    deleteArchive: settings.deleteArchive
  });

  setBadge('');
  if (reply.ok) {
    const list = reply.files.join(', ');
    notify(`${reply.files.length} demo${reply.files.length === 1 ? '' : 's'} ready`,
      `${list}\nIn CS2 console: playdemo ${reply.files[0].replace(/\.dem$/, '')}`);
  } else {
    notify('DemoDrop could not finish', `${reply.error}\nThe download is still in Downloads\\${DOWNLOAD_SUBDIR}.`);
  }
}

// ---------- messages from content scripts / options page ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'download') {
    requestedUrls.add(msg.url);
    chrome.downloads.download({ url: msg.url }, id => {
      sendResponse({ ok: id !== undefined, error: chrome.runtime.lastError?.message });
    });
    return true;
  }
  if (msg.type === 'hltv-match') {
    chrome.storage.session.get('hltvDates').then(({ hltvDates = {} }) => {
      hltvDates[msg.url] = msg.date;
      chrome.storage.session.set({ hltvDates });
    });
    return;
  }
  if (msg.type === 'ping-host') {
    sendToHost({ type: 'ping' }).then(sendResponse);
    return true;
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ---------- small UI helpers ----------

function setBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}
