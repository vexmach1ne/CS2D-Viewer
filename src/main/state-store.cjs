const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SESSION_SCHEMA_VERSION = 1;
const VIEWER_SCHEMA_VERSION = 'viewer-v1';
const PARSER_VERSION = '0.41.3';
const DEFAULT_SAMPLE_STEP = 8;
const MAP_LAYOUT_VERSION = 2;
const VALID_SPEEDS = new Set([0.25, 0.5, 1, 1.5, 2, 4]);

const DEFAULT_MAP_LAYOUTS = Object.freeze({
  de_ancient: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_anubis: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_dust2: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_inferno: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_mirage: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_nuke: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_overpass: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function createStoragePaths(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const cacheDir = path.join(resolvedRoot, 'cache');
  ensureDir(resolvedRoot);
  ensureDir(cacheDir);
  return {
    rootDir: resolvedRoot,
    cacheDir,
    sessionPath: path.join(resolvedRoot, 'session.json'),
    preferencesPath: path.join(resolvedRoot, 'preferences.json'),
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.copyFileSync(temporaryPath, filePath);
      fs.unlinkSync(temporaryPath);
    } catch (_copyError) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (_cleanupError) {
        // Best-effort cleanup only.
      }
      throw error;
    }
  }
}

function defaultSession() {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    active: null,
    playback: { lastTick: 0, followSteamId: '', speed: 1 },
  };
}

function defaultPreferences() {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    audio: { muted: false, volume: 0.85 },
    visuals: {
      showTrails: true,
      showShots: true,
      showNades: true,
      showTeamCards: true,
      showPlayerLabels: true,
      fastFreezeTime: false,
    },
    mapLayoutVersion: MAP_LAYOUT_VERSION,
    mapLayouts: JSON.parse(JSON.stringify(DEFAULT_MAP_LAYOUTS)),
  };
}

function sanitizeSession(raw) {
  const clean = defaultSession();
  if (!raw || Number(raw.schemaVersion) !== SESSION_SCHEMA_VERSION) return clean;
  const active = raw.active;
  if (
    active && typeof active.sourcePath === 'string' && typeof active.fingerprint === 'string' &&
    typeof active.cacheFile === 'string' && path.basename(active.cacheFile) === active.cacheFile
  ) {
    clean.active = {
      sourcePath: path.resolve(active.sourcePath),
      title: String(active.title || path.basename(active.sourcePath)),
      size: Math.max(0, Number(active.size || 0)),
      mtimeMs: Math.max(0, Number(active.mtimeMs || 0)),
      fingerprint: String(active.fingerprint),
      cacheFile: active.cacheFile,
      cacheBytes: Math.max(0, Number(active.cacheBytes || 0)),
      cacheSha256: String(active.cacheSha256 || ''),
      mapName: String(active.mapName || ''),
      durationSeconds: Math.max(0, Number(active.durationSeconds || 0)),
      warnings: Array.isArray(active.warnings) ? active.warnings.map(String).slice(0, 100) : [],
      generatedAt: String(active.generatedAt || ''),
    };
  }
  const playback = raw.playback || {};
  clean.playback.lastTick = Math.max(0, Math.round(Number(playback.lastTick || 0)));
  clean.playback.followSteamId = /^\d{1,32}$/.test(String(playback.followSteamId || '')) ? String(playback.followSteamId) : '';
  clean.playback.speed = VALID_SPEEDS.has(Number(playback.speed)) ? Number(playback.speed) : 1;
  return clean;
}

function sanitizeLayout(layout, fallback = { scale: 1, panX: 0, panY: 0, zoom: 1 }) {
  return {
    scale: clamp(layout?.scale, 0.4, 2.4, fallback.scale),
    panX: clamp(layout?.panX, -0.8, 0.8, fallback.panX),
    panY: clamp(layout?.panY, -0.8, 0.8, fallback.panY),
    zoom: clamp(layout?.zoom, 0.5, 3, fallback.zoom),
  };
}

function sanitizePreferences(raw) {
  const clean = defaultPreferences();
  if (!raw || Number(raw.schemaVersion) !== SESSION_SCHEMA_VERSION) return clean;
  clean.audio.muted = Boolean(raw.audio?.muted);
  clean.audio.volume = clamp(raw.audio?.volume, 0, 1, clean.audio.volume);
  for (const key of Object.keys(clean.visuals)) {
    if (typeof raw.visuals?.[key] === 'boolean') clean.visuals[key] = raw.visuals[key];
  }
  if (Number(raw.mapLayoutVersion) === MAP_LAYOUT_VERSION && raw.mapLayouts && typeof raw.mapLayouts === 'object') {
    for (const [mapName, layout] of Object.entries(raw.mapLayouts)) {
      if (/^(de|cs)_[a-z0-9_]{1,48}$/i.test(mapName)) {
        clean.mapLayouts[mapName.toLowerCase()] = sanitizeLayout(layout, clean.mapLayouts[mapName.toLowerCase()]);
      }
    }
  }
  return clean;
}

function readSession(paths) {
  return sanitizeSession(readJson(paths.sessionPath, null));
}

function readPreferences(paths) {
  return sanitizePreferences(readJson(paths.preferencesPath, null));
}

function saveSession(paths, session) {
  const clean = sanitizeSession(session);
  writeJsonAtomic(paths.sessionPath, clean);
  return clean;
}

function savePreferences(paths, preferences) {
  const clean = sanitizePreferences(preferences);
  writeJsonAtomic(paths.preferencesPath, clean);
  return clean;
}

function applyStatePatch(paths, rawPatch) {
  const patch = rawPatch && typeof rawPatch === 'object' ? rawPatch : {};
  const session = readSession(paths);
  const preferences = readPreferences(paths);
  if (patch.playback && typeof patch.playback === 'object') {
    if (Number.isFinite(Number(patch.playback.lastTick))) session.playback.lastTick = Math.max(0, Math.round(Number(patch.playback.lastTick)));
    if (patch.playback.followSteamId !== undefined) {
      const steamId = String(patch.playback.followSteamId || '');
      session.playback.followSteamId = /^\d{1,32}$/.test(steamId) ? steamId : '';
    }
    if (VALID_SPEEDS.has(Number(patch.playback.speed))) session.playback.speed = Number(patch.playback.speed);
  }
  if (patch.preferences && typeof patch.preferences === 'object') {
    const next = {
      ...preferences,
      ...patch.preferences,
      audio: { ...preferences.audio, ...(patch.preferences.audio || {}) },
      visuals: { ...preferences.visuals, ...(patch.preferences.visuals || {}) },
      mapLayouts: { ...preferences.mapLayouts, ...(patch.preferences.mapLayouts || {}) },
    };
    Object.assign(preferences, sanitizePreferences(next));
  }
  return { session: saveSession(paths, session), preferences: savePreferences(paths, preferences) };
}

function getDemoIdentity(sourcePath, sampleStep = DEFAULT_SAMPLE_STEP) {
  const resolvedPath = path.resolve(String(sourcePath || ''));
  if (path.extname(resolvedPath).toLowerCase() !== '.dem') throw new Error('Select a Counter-Strike demo file with the .dem extension.');
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error('The selected demo path is not a file.');
  const identity = {
    sourcePath: resolvedPath,
    title: path.basename(resolvedPath, path.extname(resolvedPath)),
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    parserVersion: PARSER_VERSION,
    viewerVersion: VIEWER_SCHEMA_VERSION,
    sampleStep: Math.max(1, Math.round(Number(sampleStep || DEFAULT_SAMPLE_STEP))),
  };
  const canonicalPath = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
  const fingerprintSource = JSON.stringify({ ...identity, sourcePath: canonicalPath });
  return { ...identity, fingerprint: crypto.createHash('sha256').update(fingerprintSource).digest('hex') };
}

function resolveCachePath(paths, cacheFile) {
  if (!cacheFile || path.basename(cacheFile) !== cacheFile) return null;
  const candidate = path.resolve(paths.cacheDir, cacheFile);
  const prefix = `${path.resolve(paths.cacheDir)}${path.sep}`;
  return candidate.startsWith(prefix) ? candidate : null;
}

function cachePathForFingerprint(paths, fingerprint) {
  if (!/^[a-f0-9]{64}$/.test(String(fingerprint || ''))) throw new Error('Invalid demo fingerprint.');
  return path.join(paths.cacheDir, `${fingerprint}.viewer.json`);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function inspectCacheEnvelope(cachePath, fileSize) {
  const handle = fs.openSync(cachePath, 'r');
  try {
    const prefixLength = Math.min(fileSize, 64 * 1024);
    const prefixBuffer = Buffer.alloc(prefixLength);
    fs.readSync(handle, prefixBuffer, 0, prefixLength, 0);
    const prefix = prefixBuffer.toString('utf8');
    const suffixLength = Math.min(fileSize, 1024);
    const suffixBuffer = Buffer.alloc(suffixLength);
    fs.readSync(handle, suffixBuffer, 0, suffixLength, Math.max(0, fileSize - suffixLength));
    const suffix = suffixBuffer.toString('utf8').trimEnd();
    if (!prefix.trimStart().startsWith('{"meta":') || !suffix.endsWith('}')) {
      return { valid: false, reason: 'cache-json-envelope-invalid' };
    }
    const viewerVersion = prefix.match(/"viewerVersion"\s*:\s*"([^"]+)"/)?.[1] || '';
    const parserVersion = prefix.match(/"parserVersion"\s*:\s*"([^"]+)"/)?.[1] || '';
    const sampleStep = Number(prefix.match(/"sampleStep"\s*:\s*(\d+)/)?.[1]);
    if (viewerVersion !== VIEWER_SCHEMA_VERSION) return { valid: false, reason: 'cache-schema-incompatible' };
    if (parserVersion !== PARSER_VERSION) return { valid: false, reason: 'cache-parser-incompatible' };
    if (sampleStep !== DEFAULT_SAMPLE_STEP) return { valid: false, reason: 'cache-sample-step-incompatible' };
    if (fileSize <= 4 * 1024 * 1024) {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !parsed.meta || !parsed.tracks) {
        return { valid: false, reason: 'cache-bundle-invalid' };
      }
    }
    return { valid: true, reason: '' };
  } catch (_error) {
    return { valid: false, reason: 'cache-json-invalid' };
  } finally {
    fs.closeSync(handle);
  }
}

async function validateActiveCache(paths, active) {
  const cachePath = resolveCachePath(paths, active?.cacheFile);
  if (!cachePath) return { valid: false, reason: 'invalid-cache-path', cachePath: null };
  try {
    const stat = fs.statSync(cachePath);
    if (!stat.isFile() || Number(active?.cacheBytes) <= 0 || Number(stat.size) !== Number(active.cacheBytes)) {
      return { valid: false, reason: 'cache-size-mismatch', cachePath };
    }
    if (!/^[a-f0-9]{64}$/.test(String(active?.cacheSha256 || ''))) {
      return { valid: false, reason: 'cache-checksum-missing', cachePath };
    }
    if ((await hashFile(cachePath)) !== active.cacheSha256) {
      return { valid: false, reason: 'cache-checksum-mismatch', cachePath };
    }
    const envelope = inspectCacheEnvelope(cachePath, Number(stat.size));
    if (!envelope.valid) return { ...envelope, cachePath };
    return { valid: true, reason: '', cachePath };
  } catch (error) {
    return { valid: false, reason: error.code || 'cache-unavailable', cachePath };
  }
}

function pruneCaches(paths, keepFile) {
  const keep = String(keepFile || '');
  for (const entry of fs.readdirSync(paths.cacheDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === keep) continue;
    if (!entry.name.endsWith('.viewer.json') && !entry.name.endsWith('.viewer.json.tmp') && !entry.name.includes('.viewer.json.tmp-')) continue;
    const target = resolveCachePath(paths, entry.name);
    if (target) {
      try { fs.unlinkSync(target); } catch (_error) { /* Best-effort derived-cache cleanup. */ }
    }
  }
}

module.exports = {
  DEFAULT_MAP_LAYOUTS, DEFAULT_SAMPLE_STEP, PARSER_VERSION, SESSION_SCHEMA_VERSION, VIEWER_SCHEMA_VERSION,
  applyStatePatch, cachePathForFingerprint, createStoragePaths, defaultPreferences, defaultSession,
  getDemoIdentity, hashFile, inspectCacheEnvelope, pruneCaches, readPreferences, readSession, resolveCachePath,
  sanitizePreferences, sanitizeSession, savePreferences, saveSession, validateActiveCache, writeJsonAtomic,
};
