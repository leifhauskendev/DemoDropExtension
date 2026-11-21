// DemoDrop background worker.
// Spots demo downloads from HLTV / FACEIT, files them under Downloads\DemoDrop,
// then hands the finished file to the native helper, which unpacks it and moves
// the .dem files into the CS2 folder.

const HOST_NAME = 'com.leifhauskendev.demodrop';
const DOWNLOAD_SUBDIR = 'DemoDrop';

const DEFAULT_SETTINGS = {
  targetDir: '',          // empty = let the helper find CS2's game\csgo folder
  deleteArchive: true,    // remove the downloaded archive after unpacking
  catchSiteDownloads: true, // also handle demos started with the site's own buttons
  refragImport: 'off'     // FACEIT demos: 'off' | 'ask' (pop-up button) | 'always'
};

const REFRAG_API = 'https://api-k8s.refrag.gg/';
const REFRAG_APP = 'https://play.refrag.gg/';

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

// Builds a readable file name for a FACEIT demo from its match details.
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
  if (!reply.ok) {
    notify('DemoDrop could not finish', `${reply.error}\nThe download is still in Downloads\\${DOWNLOAD_SUBDIR}.`);
    return;
  }

  const title = `${reply.files.length} demo${reply.files.length === 1 ? '' : 's'} ready`;
  const message = `${reply.files.join(', ')}\nIn CS2 console: playdemo ${reply.files[0].replace(/\.dem$/, '')}`;
  const items = reply.files.map(f => ({ file: `${reply.dir}\\${f}` }));

  if (info.source === 'faceit' && settings.refragImport === 'always') {
    notify(title, message);
    await importToRefrag(items);
  } else if (info.source === 'faceit' && settings.refragImport === 'ask') {
    const id = await notify(title, `${message}\nClick to import into Refrag.`, {
      buttons: [{ title: 'Import to Refrag' }],
      requireInteraction: true
    });
    const { refragOffers = {} } = await chrome.storage.session.get('refragOffers');
    refragOffers[id] = items;
    await chrome.storage.session.set({ refragOffers });
  } else {
    notify(title, message);
  }
}

// ---------- Refrag import ----------
// Refrag's own "Upload demo" dialog does: POST demos.json with the file's
// SHA-256 -> PUT the file to the returned upload link -> POST demos/<id>/analyze.
// We do the same, with the login Refrag keeps in the browser (see
// content-refrag.js). The helper hashes and uploads, since it can read the file.

async function getRefragSession() {
  const { refragSession } = await chrome.storage.local.get('refragSession');
  return refragSession || null;
}

function refragHeaders(session) {
  // Stored as "token-type|access-token|client|uid|expiry".
  const names = ['Token-Type', 'Access-Token', 'Client', 'Uid', 'Expiry'];
  const parts = session.token.split('|');
  const headers = {};
  names.forEach((n, i) => { if (parts[i]) headers[n] = parts[i]; });
  if (session.teamId) headers['X-TEAM-ID'] = session.teamId;
  return headers;
}

async function refragFetch(session, path, options = {}) {
  const res = await fetch(REFRAG_API + path, {
    ...options,
    headers: { ...refragHeaders(session), ...(options.headers || {}) }
  });
  if (res.status === 401) {
    await chrome.storage.local.remove('refragSession');
    throw Object.assign(new Error('Your Refrag login has expired.'), { signIn: true });
  }
  if (!res.ok) throw new Error(`Refrag answered HTTP ${res.status}`);
  return res.json();
}

async function refragUser() {
  const session = await getRefragSession();
  if (!session) return null;
  try {
    const { data: u } = await refragFetch(session, 'auth/validate_token');
    return { name: u.username || u.nickname || u.name || u.faceit_nickname || 'your Refrag account' };
  } catch {
    return null;
  }
}

// Imports waiting for a Refrag sign-in run as soon as the user signs in.
async function deferImport(items) {
  const { refragPending = [] } = await chrome.storage.local.get('refragPending');
  const files = new Set(refragPending.map(p => p.file));
  await chrome.storage.local.set({ refragPending: [...refragPending, ...items.filter(p => !files.has(p.file))] });
}

async function resumePendingImport() {
  const { refragPending = [] } = await chrome.storage.local.get('refragPending');
  if (!refragPending.length) return;
  await chrome.storage.local.remove('refragPending');
  await importToRefrag(refragPending);
}

async function importToRefrag(items) {
  const session = await getRefragSession();
  if (!session) {
    await deferImport(items);
    offerRefragSignIn('Sign in to Refrag and the import will start by itself.');
    return;
  }
  for (const [i, { file }] of items.entries()) {
    const name = file.split('\\').pop();
    try {
      setBadge('↑');
      const hash = await sendToHost({ type: 'hash', file });
      if (!hash.ok) throw new Error(hash.error);

      // Refrag creates a new demo entry on every POST, even for a file it
      // already has, so don't ask it again for demos we imported before.
      const known = await findImported(session, hash.sha256);
      if (known) {
        await notifyRefragLink('Already on Refrag', `${name}\nClick to open it in Refrag.`, known.link);
        continue;
      }

      const form = new FormData();
      form.append('demo[game]', 'cs2');
      form.append('demo[file_hash]', hash.sha256);
      const demo = await refragFetch(session, 'demos.json', { method: 'POST', body: form });

      if (demo.status !== 'ready') {
        notify('Uploading to Refrag…', `${name} (${Math.round(hash.size / 1048576)} MB)`);
        const up = await sendToHost({
          type: 'upload',
          file,
          url: demo.demo_upload_url,
          headers: session.teamId ? { 'X-TEAM-ID': session.teamId } : {}
        });
        if (!up.ok) throw new Error(up.error);
      }

      const analysis = demo.status === 'ready' ? {} : await refragFetch(session, `demos/${demo.id}/analyze`, { method: 'POST' });
      const link = analysis.match_id ? `${REFRAG_APP}matches/${analysis.match_id}` : `${REFRAG_APP}demos/${demo.id}`;
      await rememberImported(session, hash.sha256, { demoId: demo.id, link });
      await notifyRefragLink(demo.status === 'ready' ? 'Already on Refrag' : 'Imported to Refrag',
        `${name}\nClick to open it in Refrag${demo.status === 'ready' ? '' : ' (processing can take a few minutes)'}.`, link);
    } catch (err) {
      if (err.signIn) {
        await deferImport(items.slice(i));
        offerRefragSignIn(`${err.message} Sign in again and the import will continue by itself.`);
        return;
      }
      notify('Refrag import failed', `${name}\n${err.message}`);
    } finally {
      setBadge('');
    }
  }
}

// Demos DemoDrop has imported, by Refrag team and file SHA-256.
async function rememberImported(session, sha256, entry) {
  const { refragImported = {} } = await chrome.storage.local.get('refragImported');
  refragImported[`${session.teamId}:${sha256}`] = entry;
  await chrome.storage.local.set({ refragImported });
}

async function findImported(session, sha256) {
  const key = `${session.teamId}:${sha256}`;
  const { refragImported = {} } = await chrome.storage.local.get('refragImported');
  const entry = refragImported[key];
  if (!entry) return null;
  // Still there? (It may have been deleted on Refrag since.)
  const res = await fetch(`${REFRAG_API}demos/${entry.demoId}.json`, { headers: refragHeaders(session) });
  if (res.ok) return entry;
  if (res.status === 404) {
    delete refragImported[key];
    await chrome.storage.local.set({ refragImported });
    return null;
  }
  if (res.status === 401) {
    await chrome.storage.local.remove('refragSession');
    throw Object.assign(new Error('Your Refrag login has expired.'), { signIn: true });
  }
  return entry; // other errors: assume it's still there rather than duplicate it
}

async function notifyRefragLink(title, message, link) {
  const id = await notify(title, message);
  const { refragLinks = {} } = await chrome.storage.session.get('refragLinks');
  refragLinks[id] = link;
  await chrome.storage.session.set({ refragLinks });
}

async function offerRefragSignIn(message) {
  const id = await notify('Refrag: sign in needed', `${message}\nClick to open Refrag.`);
  const { refragLinks = {} } = await chrome.storage.session.get('refragLinks');
  refragLinks[id] = `${REFRAG_APP}login`;
  await chrome.storage.session.set({ refragLinks });
}

async function handleNotificationClick(id) {
  const { refragOffers = {}, refragLinks = {} } = await chrome.storage.session.get(['refragOffers', 'refragLinks']);
  if (refragOffers[id]) {
    const items = refragOffers[id];
    delete refragOffers[id];
    await chrome.storage.session.set({ refragOffers });
    chrome.notifications.clear(id);
    await importToRefrag(items);
  } else if (refragLinks[id]) {
    chrome.tabs.create({ url: refragLinks[id] });
    chrome.notifications.clear(id);
  }
}

chrome.notifications.onClicked.addListener(handleNotificationClick);
chrome.notifications.onButtonClicked.addListener(id => handleNotificationClick(id));

// ---------- messages from content scripts / options page ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
  if (msg.type === 'refrag-session') {
    // From content-refrag.js: null means signed out on Refrag. Only Refrag's
    // own site may set this.
    if (!sender.url?.startsWith(REFRAG_APP)) return;
    if (msg.session) {
      chrome.storage.local.set({ refragSession: msg.session }).then(resumePendingImport);
    } else {
      chrome.storage.local.remove('refragSession');
    }
    return;
  }
  if (msg.type === 'refrag-user') {
    refragUser().then(sendResponse);
    return true;
  }
  if (msg.type === 'refrag-sign-out') {
    chrome.storage.local.remove('refragSession').then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ---------- small UI helpers ----------

function setBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
}

function notify(title, message, extra = {}) {
  return chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    ...extra
  });
}
