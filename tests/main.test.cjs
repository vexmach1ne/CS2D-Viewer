'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_MAP_LAYOUTS,
  applyStatePatch,
  cachePathForFingerprint,
  createStoragePaths,
  getDemoIdentity,
  readPreferences,
  readSession,
  sanitizePreferences,
  sanitizeSession,
  saveSession,
  validateActiveCache,
} = require('../src/main/state-store.cjs');
const {
  resolveAllowedAssetPath,
  validateStatePatchPayload,
} = require('../src/main/protocol-paths.cjs');

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-viewer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('demo fingerprint covers path, size, parser/schema settings, and modification time', (t) => {
  const root = temporaryRoot(t);
  const demoPath = path.join(root, 'match.dem');
  fs.writeFileSync(demoPath, 'first');
  const first = getDemoIdentity(demoPath, 8);
  fs.appendFileSync(demoPath, '-changed');
  const second = getDemoIdentity(demoPath, 8);
  const alternateStep = getDemoIdentity(demoPath, 16);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.notEqual(second.fingerprint, alternateStep.fingerprint);
  assert.throws(() => getDemoIdentity(path.join(root, 'match.txt')), /\.dem extension/);
});

test('session and preference patches are validated and clamped', (t) => {
  const paths = createStoragePaths(temporaryRoot(t));
  const result = applyStatePatch(paths, {
    playback: { lastTick: 12.7, followSteamId: '76561198000000000', speed: 4 },
    preferences: {
      audio: { muted: true, volume: 9 },
      visuals: { showTrails: false },
      mapLayouts: { de_mirage: { scale: 99, panX: -9, panY: 0.2, zoom: 0.1 } },
    },
  });
  assert.deepEqual(result.session.playback, { lastTick: 13, followSteamId: '76561198000000000', speed: 4 });
  assert.equal(result.preferences.audio.volume, 1);
  assert.equal(result.preferences.visuals.showTrails, false);
  assert.deepEqual(result.preferences.mapLayouts.de_mirage, { scale: 2.4, panX: -0.8, panY: 0.2, zoom: 0.5 });
  assert.deepEqual(readSession(paths), result.session);
  assert.deepEqual(readPreferences(paths), result.preferences);
});

test('invalid persisted data falls back without leaking arbitrary cache paths', () => {
  const session = sanitizeSession({
    schemaVersion: 1,
    active: { sourcePath: 'C:\\unsafe.dem', fingerprint: 'x', cacheFile: '..\\outside.json' },
    playback: { lastTick: -5, speed: 99, followSteamId: 'not-a-steam-id' },
  });
  assert.equal(session.active, null);
  assert.deepEqual(session.playback, { lastTick: 0, followSteamId: '', speed: 1 });
  const preferences = sanitizePreferences({ schemaVersion: 1, mapLayouts: { '../../escape': { scale: 2 } } });
  assert.deepEqual(preferences.mapLayouts.de_dust2, DEFAULT_MAP_LAYOUTS.de_dust2);
  assert.equal(preferences.mapLayouts['../../escape'], undefined);
});

test('cache validation detects checksum corruption while remaining source-independent', async (t) => {
  const root = temporaryRoot(t);
  const paths = createStoragePaths(root);
  const demoPath = path.join(root, 'source.dem');
  fs.writeFileSync(demoPath, 'demo');
  const identity = getDemoIdentity(demoPath);
  const cachePath = cachePathForFingerprint(paths, identity.fingerprint);
  fs.writeFileSync(cachePath, '{"meta":{"viewerVersion":"viewer-v1","parserVersion":"0.41.3","sampleStep":8},"tracks":{}}');
  const crypto = require('node:crypto');
  const cacheBytes = fs.statSync(cachePath).size;
  const cacheSha256 = crypto.createHash('sha256').update(fs.readFileSync(cachePath)).digest('hex');
  const session = saveSession(paths, {
    schemaVersion: 1,
    active: {
      sourcePath: demoPath,
      title: 'source',
      size: identity.size,
      mtimeMs: identity.mtimeMs,
      fingerprint: identity.fingerprint,
      cacheFile: path.basename(cachePath),
      cacheBytes,
      cacheSha256,
      mapName: 'de_mirage',
      durationSeconds: 12,
      warnings: [],
      generatedAt: new Date().toISOString(),
    },
    playback: { lastTick: 10, followSteamId: '', speed: 1 },
  });
  fs.unlinkSync(demoPath);
  assert.equal((await validateActiveCache(paths, session.active)).valid, true, 'missing source still permits cached-only playback');
  fs.appendFileSync(cachePath, 'corrupt');
  assert.equal((await validateActiveCache(paths, session.active)).valid, false);
});

test('asset protocol allows known categories and rejects traversal or executable content', (t) => {
  const root = temporaryRoot(t);
  const accepted = resolveAllowedAssetPath(root, 'viewer-asset://maps/de_mirage.png');
  assert.equal(accepted, path.resolve(root, 'maps', 'de_mirage.png'));
  assert.equal(resolveAllowedAssetPath(root, 'viewer-asset://maps/../audio/secret.wav'), null);
  assert.equal(resolveAllowedAssetPath(root, 'viewer-asset://maps/%2e%2e/%2e%2e/secret.png'), null);
  assert.equal(resolveAllowedAssetPath(root, 'viewer-asset://unknown/file.png'), null);
  assert.equal(resolveAllowedAssetPath(root, 'viewer-asset://maps/payload.exe'), null);
  assert.equal(resolveAllowedAssetPath(root, 'file:///C:/Windows/System32/calc.exe'), null);
});

test('IPC state payload validation rejects unknown, cyclic, and oversized input', () => {
  assert.deepEqual(validateStatePatchPayload({ playback: { lastTick: 50 } }), { playback: { lastTick: 50 } });
  assert.throws(() => validateStatePatchPayload(null), /must be an object/);
  assert.throws(() => validateStatePatchPayload({ arbitrary: true }), /Unsupported/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => validateStatePatchPayload({ preferences: cyclic }), /JSON serializable/);
  assert.throws(() => validateStatePatchPayload({ preferences: { mapLayouts: { huge: 'x'.repeat(140000) } } }), /maximum size/);
});
