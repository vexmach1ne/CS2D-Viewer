'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { inspectCacheEnvelope } = require('../src/main/state-store.cjs');

function writeFixture(t, value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-cache-envelope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'bundle.viewer.json');
  fs.writeFileSync(filePath, value);
  return { filePath, size: fs.statSync(filePath).size };
}

test('cache envelope accepts the current schema, parser, and sample step', (t) => {
  const fixture = writeFixture(t, JSON.stringify({
    meta: { viewerVersion: 'viewer-v1', parserVersion: '0.41.3', sampleStep: 8 },
    tracks: {},
  }));
  assert.deepEqual(inspectCacheEnvelope(fixture.filePath, fixture.size), { valid: true, reason: '' });
});

test('cache envelope rejects incompatible viewer, parser, and sample settings', (t) => {
  for (const [meta, reason] of [
    [{ viewerVersion: 'pview-v20', parserVersion: '0.41.3', sampleStep: 8 }, 'cache-schema-incompatible'],
    [{ viewerVersion: 'viewer-v1', parserVersion: '0.40.3', sampleStep: 8 }, 'cache-parser-incompatible'],
    [{ viewerVersion: 'viewer-v1', parserVersion: '0.41.3', sampleStep: 16 }, 'cache-sample-step-incompatible'],
  ]) {
    const fixture = writeFixture(t, JSON.stringify({ meta, tracks: {} }));
    assert.equal(inspectCacheEnvelope(fixture.filePath, fixture.size).reason, reason);
  }
});

test('cache envelope rejects malformed JSON and non-bundle content', (t) => {
  const malformed = writeFixture(t, '{"meta":{"viewerVersion":"viewer-v1","parserVersion":"0.41.3","sampleStep":8},"tracks":{}BROKEN}');
  assert.equal(inspectCacheEnvelope(malformed.filePath, malformed.size).valid, false);
  const missingTracks = writeFixture(t, JSON.stringify({
    meta: { viewerVersion: 'viewer-v1', parserVersion: '0.41.3', sampleStep: 8 },
  }));
  assert.deepEqual(inspectCacheEnvelope(missingTracks.filePath, missingTracks.size), { valid: false, reason: 'cache-bundle-invalid' });
});
