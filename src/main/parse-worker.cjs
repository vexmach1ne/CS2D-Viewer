'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { buildDemoViewerBundle } = require('../core/demo-viewer.cjs');

function send(message) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(message);
    return;
  }
  if (typeof process.send === 'function') process.send(message);
}

function readRequest() {
  const encoded = process.argv[2];
  if (!encoded) throw new Error('The parser worker did not receive a request.');
  const request = JSON.parse(encoded);
  if (!request || typeof request !== 'object') throw new Error('Invalid parser worker request.');
  const sourcePath = path.resolve(String(request.sourcePath || ''));
  const outputPath = path.resolve(String(request.outputPath || ''));
  if (path.extname(sourcePath).toLowerCase() !== '.dem') throw new Error('Parser input must be a .dem file.');
  if (!outputPath.endsWith('.viewer.json.tmp')) throw new Error('Parser output must be a temporary viewer cache.');
  return {
    sourcePath,
    outputPath,
    title: String(request.title || path.basename(sourcePath, '.dem')),
    sampleStep: Math.max(1, Math.min(64, Math.round(Number(request.sampleStep || 8)))),
  };
}

function run() {
  const request = readRequest();
  const bundle = buildDemoViewerBundle(
    { filePath: request.sourcePath, title: request.title },
    { sampleStep: request.sampleStep, onProgress: (progress) => send({ type: 'progress', progress }) }
  );
  send({
    type: 'progress',
    progress: { stage: 'serialize', progress: 0.98, percent: 98, message: 'Writing isolated viewer cache' },
  });
  const serialized = JSON.stringify(bundle);
  fs.writeFileSync(request.outputPath, serialized, { encoding: 'utf8', flag: 'wx' });
  const cacheBytes = Buffer.byteLength(serialized, 'utf8');
  const cacheSha256 = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  send({
    type: 'complete',
    result: {
      cacheBytes,
      cacheSha256,
      meta: bundle.meta,
      warnings: Array.isArray(bundle.warnings) ? bundle.warnings : [],
    },
  });
}

try {
  run();
  setTimeout(() => process.exit(0), 20);
} catch (error) {
  send({
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : '',
  });
  setTimeout(() => process.exit(1), 20);
}
