// DemoDrop native messaging host.
// Chrome starts this through demodrop-host.bat and talks to it over stdin/stdout
// (each message is a 4-byte little-endian length followed by JSON). Never write
// anything else to stdout: debug output goes to the log file instead.

const fs = require('fs');
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
  log('received', JSON.stringify(msg));
  try {
    if (msg.type === 'ping') {
      send({ ok: true, version: VERSION, defaultDir: findCs2DemoDir() });
    } else if (msg.type === 'process') {
      const files = await processDemo(msg);
      log('done', files.join(', '));
      send({ ok: true, files });
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

async function processDemo({ file, targetDir, outputName, deleteArchive }) {
  if (!file || !fs.existsSync(file)) throw new Error(`Downloaded file not found: ${file}`);

  const dest = targetDir || findCs2DemoDir();
  if (!dest) throw new Error('Could not find the CS2 folder. Set it in DemoDrop settings.');
  if (!fs.existsSync(dest)) throw new Error(`Target folder does not exist: ${dest}`);

  const lower = file.toLowerCase();
  let results;

  if (lower.endsWith('.rar')) {
    results = await extractRar(file, dest);
  } else if (lower.endsWith('.dem.zst') || lower.endsWith('.dem.gz')) {
    const name = outputName || path.basename(file).replace(/\.(zst|gz)$/i, '');
    const target = uniquePath(path.join(dest, name));
    const decompress = lower.endsWith('.zst') ? zlib.createZstdDecompress() : zlib.createGunzip();
    await pipeline(fs.createReadStream(file), decompress, fs.createWriteStream(target));
    results = [path.basename(target)];
  } else if (lower.endsWith('.dem')) {
    const target = uniquePath(path.join(dest, outputName || path.basename(file)));
    await moveFile(file, target);
    return [path.basename(target)]; // already moved, nothing left to delete
  } else {
    throw new Error(`Not a demo file: ${path.basename(file)}`);
  }

  if (results.length === 0) throw new Error('The archive did not contain any .dem files.');
  if (deleteArchive) fs.promises.unlink(file).catch(e => log('could not delete archive', e.message));
  return results;
}

async function extractRar(file, dest) {
  // Unpack into a temp folder first so existing demos with the same name are
  // never overwritten, then move each .dem across with a unique name.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demodrop-'));
  try {
    const extractor = await createExtractorFromFile({ filepath: file, targetPath: tmp });
    const { files } = extractor.extract({ files: h => !h.flags.directory && h.name.toLowerCase().endsWith('.dem') });
    const names = [];
    for (const f of files) {
      const src = path.join(tmp, f.fileHeader.name);
      const target = uniquePath(path.join(dest, path.basename(f.fileHeader.name)));
      await moveFile(src, target);
      names.push(path.basename(target));
    }
    return names;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) {
    const candidate = path.join(dir, `${name}_${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}
