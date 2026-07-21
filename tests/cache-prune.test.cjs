'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createStoragePaths, pruneCaches } = require('../src/main/state-store.cjs');

test('cache pruning retains only the active bundle and removes crash-left temporary bundles', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-viewer-prune-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = createStoragePaths(root);
  const keep = `${'a'.repeat(64)}.viewer.json`;
  const stale = `${'b'.repeat(64)}.viewer.json`;
  const temporary = `${'c'.repeat(64)}-123-456.viewer.json.tmp`;
  fs.writeFileSync(path.join(paths.cacheDir, keep), '{}');
  fs.writeFileSync(path.join(paths.cacheDir, stale), '{}');
  fs.writeFileSync(path.join(paths.cacheDir, temporary), '{}');
  fs.writeFileSync(path.join(paths.cacheDir, 'unrelated.txt'), 'keep');

  pruneCaches(paths, keep);

  assert.equal(fs.existsSync(path.join(paths.cacheDir, keep)), true);
  assert.equal(fs.existsSync(path.join(paths.cacheDir, stale)), false);
  assert.equal(fs.existsSync(path.join(paths.cacheDir, temporary)), false);
  assert.equal(fs.existsSync(path.join(paths.cacheDir, 'unrelated.txt')), true);
});
