// DemoDrop native messaging host.
// Chrome starts this through demodrop-host.bat and talks to it over stdin/stdout
// (each message is a 4-byte little-endian length followed by JSON). Never write
// anything else to stdout: debug output goes to the log file instead.

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { execFileSync } = require('child_process');
const { createExtractorFromFile } = require('node-unrar-js');

const VERSION = require('./package.json').version;
const LOG_FILE = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'DemoDrop', 'host.log');

function log(...args) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${args.join(' ')}\n`);
  } catch {}
}

// ---------- native messaging protocol ----------

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const len = buffer.readUInt32LE(0);
    if (buffer.length < 4 + len) break;
    const msg = JSON.parse(buffer.subarray(4, 4 + len).toString('utf8'));
    buffer = buffer.subarray(4 + len);
    handle(msg);
  }
});

// Chrome closes stdin when the extension disconnects; finish any work first.
let pending = 0;
let stdinClosed = false;
process.stdin.on('end', () => {
  stdinClosed = true;
  if (pending === 0) process.exit(0);
});

async function handle(msg) {
  pending++;
  try {
    await handleMessage(msg);
  } finally {
    pending--;
    if (stdinClosed && pending === 0) process.exit(0);
  }
}

async function handleMessage(msg) {
  // Upload requests carry login headers and a signed link: never log those.
  log('received', JSON.stringify(msg, (k, v) =>
    k === 'headers' ? '[redacted]' : k === 'url' && typeof v === 'string' ? v.split('?')[0] : v));
  try {
    if (msg.type === 'ping') {
      send({ ok: true, version: VERSION, defaultDir: findCs2DemoDir() });
    } else if (msg.type === 'process') {
      const { files, dir } = await processDemo(msg);
      log('done', files.join(', '));
      send({ ok: true, files, dir });
    } else if (msg.type === 'hash') {
      send({ ok: true, ...(await hashFile(msg.file)) });
    } else if (msg.type === 'upload') {
      await uploadFile(msg);
      log('uploaded', msg.file);
      send({ ok: true });
    } else {
      send({ ok: false, error: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    log('error', err.stack || err);
    send({ ok: false, error: err.message || String(err) });
  }
}

// ---------- finding CS2 ----------

function findCs2DemoDir() {
  let steamPath;
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8' });
    steamPath = out.match(/SteamPath\s+REG_SZ\s+(.+)/)[1].trim();
  } catch {
    return null;
  }

  const libraries = [steamPath];
  try {
    const vdf = fs.readFileSync(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.push(m[1].replace(/\\\\/g, '\\'));
  } catch {}

  for (const lib of libraries) {
    const dir = path.join(lib, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo');
    if (fs.existsSync(dir)) return path.normalize(dir);
  }
  return null;
}

// ---------- unpacking and moving ----------

async function processDemo({ file, targetDir, outputName, dateSuffix, deleteArchive }) {
  if (!file || !fs.existsSync(file)) throw new Error(`Downloaded file not found: ${file}`);

  const dest = targetDir || findCs2DemoDir();
  if (!dest) throw new Error('Could not find the CS2 folder. Set it in DemoDrop settings.');
  if (!fs.existsSync(dest)) throw new Error(`Target folder does not exist: ${dest}`);

  const lower = file.toLowerCase();
  let results;

  if (lower.endsWith('.rar')) {
    results = await extractRar(file, dest, dateSuffix);
  } else if (lower.endsWith('.dem.zst') || lower.endsWith('.dem.gz')) {
    const wanted = path.join(dest, outputName || path.basename(file).replace(/\.(zst|gz)$/i, ''));
    const target = uniquePath(wanted);
    const decompress = lower.endsWith('.zst') ? zlib.createZstdDecompress() : zlib.createGunzip();
    await pipeline(fs.createReadStream(file), decompress, fs.createWriteStream(target));
    results = [path.basename(await dropIfDuplicate(target, wanted))];
  } else if (lower.endsWith('.dem')) {
    const wanted = path.join(dest, outputName || path.basename(file));
    const target = uniquePath(wanted);
    await moveFile(file, target);
    const kept = await dropIfDuplicate(target, wanted);
    return { files: [path.basename(kept)], dir: dest }; // already moved, nothing left to delete
  } else {
    throw new Error(`Not a demo file: ${path.basename(file)}`);
  }

  if (results.length === 0) throw new Error('The archive did not contain any .dem files.');
  if (deleteArchive) fs.promises.unlink(file).catch(e => log('could not delete archive', e.message));
  return { files: results, dir: dest };
}

// ---------- Refrag import ----------
// The extension talks to Refrag's API; the helper only does the parts that need
// the file itself, since demos are hundreds of MB and live outside Downloads.

function demoFileOnly(file) {
  if (!file || !file.toLowerCase().endsWith('.dem') || !fs.existsSync(file)) {
    throw new Error(`Demo file not found: ${file}`);
  }
}

async function hashFile(file) {
  demoFileOnly(file);
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return { sha256: hash.digest('hex'), size: fs.statSync(file).size };
}

async function uploadFile({ file, url, headers }) {
  demoFileOnly(file);
  // The upload link comes from Refrag's API (a signed storage URL).
  if (new URL(url).protocol !== 'https:') throw new Error('Refrag gave a non-secure upload link');
  const size = fs.statSync(file).size;
  // Big uploads occasionally lose the connection: try a few times.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Length': String(size) },
        body: fs.createReadStream(file),
        duplex: 'half'
      });
      if (res.ok) return;
      const body = (await res.text()).slice(0, 300);
      log(`upload attempt ${attempt}: HTTP ${res.status}`, body);
      if (res.status < 500 || attempt === 3) throw new Error(`Refrag upload failed (HTTP ${res.status})`);
    } catch (err) {
      // fetch hides the real network error in err.cause
      const reason = err.cause?.code || err.cause?.message || err.message;
      log(`upload attempt ${attempt} failed:`, reason);
      if (err.message.startsWith('Refrag upload failed') || attempt === 3) {
        throw new Error(err.message.startsWith('Refrag upload failed') ? err.message : `Upload to Refrag failed: ${reason}`);
      }
    }
    await new Promise(r => setTimeout(r, attempt * 3000));
  }
}

async function extractRar(file, dest, dateSuffix) {
  // Unpack into a temp folder first so existing demos with the same name are
  // never overwritten, then move each .dem across with a unique name.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demodrop-'));
  try {
    const extractor = await createExtractorFromFile({ filepath: file, targetPath: tmp });
    const { files } = extractor.extract({ files: h => !h.flags.directory && h.name.toLowerCase().endsWith('.dem') });
    const names = [];
    for (const f of files) {
      const src = path.join(tmp, f.fileHeader.name);
      const inner = path.basename(f.fileHeader.name);
      const event = hltvEventName(file, inner);
      let name = event ? `${event}-${inner}` : inner;
      if (dateSuffix) name = name.replace(/\.dem$/i, `-${dateSuffix}.dem`);
      const wanted = path.join(dest, name);
      const target = uniquePath(wanted);
      await moveFile(src, target);
      names.push(path.basename(await dropIfDuplicate(target, wanted)));
    }
    return names;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// HLTV archives are named <event>-<team1>-vs-<team2>-bo3-<random id>.rar, while
// the demos inside are only <team1>-vs-<team2>-m1-<map>.dem. Return the <event>
// part: everything in the archive name before the demo's team names.
function hltvEventName(archive, demoName) {
  const teams = demoName.match(/^(.*)-m\d+-[^-]+\.dem$/i)?.[1];
  if (!teams) return null;
  const base = path.basename(archive, path.extname(archive));
  const at = base.indexOf(`-${teams}-bo`);
  return at > 0 ? base.slice(0, at) : null;
}

// Same approach as DemoDrop's move-file handler: rename, with a copy+delete
// fallback when source and target are on different drives.
async function moveFile(src, target) {
  try {
    await fs.promises.rename(src, target);
  } catch (err) {
    if (['EXDEV', 'EACCES', 'EPERM'].includes(err.code)) {
      await fs.promises.copyFile(src, target);
      await fs.promises.unlink(src);
    } else {
      throw err;
    }
  }
}

// uniquePath avoids overwriting a different demo that has the same name. If the
// demo we just wrote is byte-for-byte the one already there (the same match
// downloaded twice), drop the new copy and keep using the existing file.
async function dropIfDuplicate(written, wanted) {
  if (written === wanted || !fs.existsSync(wanted)) return written;
  if (fs.statSync(written).size !== fs.statSync(wanted).size) return written;
  const [a, b] = await Promise.all([hashFile(written), hashFile(wanted)]);
  if (a.sha256 !== b.sha256) return written;
  await fs.promises.unlink(written);
  log('same demo already there, kept', path.basename(wanted));
  return wanted;
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) {
    const candidate = path.join(dir, `${name}_${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}
