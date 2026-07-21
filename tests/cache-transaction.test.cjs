'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { commitTemporaryCache } = require('../src/main/cache-transaction.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-cache-transaction-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, temporary: path.join(root, 'next.viewer.json.tmp'), final: path.join(root, 'active.viewer.json') };
}

test('cache commit atomically replaces an existing active bundle', (t) => {
  const files = fixture(t);
  fs.writeFileSync(files.final, 'previous');
  fs.writeFileSync(files.temporary, 'next');
  commitTemporaryCache(files.temporary, files.final);
  assert.equal(fs.readFileSync(files.final, 'utf8'), 'next');
  assert.equal(fs.existsSync(files.temporary), false);
});

test('cache commit fallback restores the previous bundle when replacement fails', (t) => {
  const files = fixture(t);
  fs.writeFileSync(files.final, 'previous');
  fs.writeFileSync(files.temporary, 'next');
  let copyCount = 0;
  const failingFs = {
    ...fs,
    renameSync() { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }); },
    copyFileSync(source, destination, flags) {
      copyCount += 1;
      if (copyCount === 2) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return fs.copyFileSync(source, destination, flags);
    },
  };
  assert.throws(() => commitTemporaryCache(files.temporary, files.final, failingFs), /disk full/);
  assert.equal(fs.readFileSync(files.final, 'utf8'), 'previous');
  assert.equal(fs.readFileSync(files.temporary, 'utf8'), 'next');
});

test('cache commit rejects paths outside one cache directory', (t) => {
  const files = fixture(t);
  assert.throws(() => commitTemporaryCache(files.temporary, path.join(files.root, 'nested', 'active.viewer.json')), /same directory/);
});
