import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeMatchStats } from '../src/renderer/stats.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(projectRoot, 'src', 'main', 'parse-worker.cjs');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function parseWithWorker(sourcePath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = fork(
      workerPath,
      [JSON.stringify({ sourcePath, outputPath, title: path.basename(sourcePath, '.dem'), sampleStep: 8 })],
      { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }
    );
    const cancel = () => child.kill();
    process.once('SIGINT', cancel);
    child.on('message', (rawMessage) => {
      const message = /** @type {any} */ (rawMessage);
      if (message?.type === 'progress') {
        const progress = message.progress || {};
        process.stdout.write(`[${String(progress.percent ?? 0).padStart(3)}%] ${progress.message || progress.stage}\n`);
      } else if (message?.type === 'complete') {
        process.removeListener('SIGINT', cancel);
        resolve(message.result);
      } else if (message?.type === 'error') {
        process.removeListener('SIGINT', cancel);
        reject(new Error(message.error || 'Parser worker failed.'));
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code && !fs.existsSync(outputPath)) reject(new Error(`Parser worker exited with code ${code}.`));
    });
  });
}

async function main() {
  const rawDemo = argument('--demo');
  if (!rawDemo) throw new Error('Usage: npm run smoke:demo -- --demo <path-to-match.dem>');
  const demoPath = path.resolve(rawDemo);
  const stat = fs.statSync(demoPath);
  if (!stat.isFile() || path.extname(demoPath).toLowerCase() !== '.dem') throw new Error('The smoke input must be a readable .dem file.');

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-viewer-smoke-'));
  try {
    const firstPath = path.join(temporaryRoot, 'first.viewer.json.tmp');
    const firstResult = await parseWithWorker(demoPath, firstPath);
    const firstBytes = fs.readFileSync(firstPath);
    assert.equal(firstBytes.length, firstResult.cacheBytes);
    assert.equal(crypto.createHash('sha256').update(firstBytes).digest('hex'), firstResult.cacheSha256);

    const bundle = JSON.parse(firstBytes.toString('utf8'));
    assert.equal(bundle.meta.viewerVersion, 'viewer-v1');
    assert.ok(Number(bundle.meta.totalTicks) > 0);
    assert.ok(Object.keys(bundle.tracks?.ticksByPlayer || {}).length > 0);

    const reopened = JSON.parse(fs.readFileSync(firstPath, 'utf8'));
    assert.equal(reopened.meta.totalTicks, bundle.meta.totalTicks, 'cache reopen preserves the bundle');
    const finalTick = Number(bundle.meta.totalTicks);
    const later = computeMatchStats(bundle, Math.round(finalTick * 0.75));
    const earlier = computeMatchStats(bundle, Math.round(finalTick * 0.25));
    const final = computeMatchStats(bundle, finalTick);
    assert.ok(later.tick > earlier.tick, 'backward seek snapshot was evaluated after a later snapshot');
    assert.equal(final.tick, finalTick);

    const rebuildPath = path.join(temporaryRoot, 'rebuild.viewer.json.tmp');
    const rebuildResult = await parseWithWorker(demoPath, rebuildPath);
    assert.ok(rebuildResult.cacheBytes > 0, 'forced rebuild produced a second isolated cache');

    const tracks = bundle.tracks || {};
    console.log(JSON.stringify({
      map: bundle.meta.mapName,
      durationSeconds: bundle.meta.durationSeconds,
      players: bundle.players?.length || 0,
      rounds: bundle.rounds?.length || 0,
      combat: { shots: tracks.shots?.length || 0, impacts: tracks.impacts?.length || 0, damage: tracks.hurts?.length || 0, kills: tracks.kills?.length || 0 },
      utility: { throws: tracks.utilityThrows?.length || 0, effects: tracks.nades?.length || 0 },
      bombEvents: tracks.bombs?.length || 0,
      warnings: bundle.warnings?.length || 0,
      finalTeams: final.teams.map((team) => ({ name: team.name, score: team.score })),
    }, null, 2));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
