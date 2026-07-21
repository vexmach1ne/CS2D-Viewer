import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function syntheticBundle() {
  const track = (steamId, name, team) => ({
    steamId,
    name,
    tick: [0, 32, 64, 96, 128],
    x: team === 'CT' ? [-600, -400, -180, 60, 280] : [600, 400, 180, -60, -280],
    y: team === 'CT' ? [-500, -250, 0, 180, 360] : [500, 250, 0, -180, -360],
    yaw: team === 'CT' ? [25, 30, 45, 60, 75] : [205, 210, 225, 240, 255],
    team: [team, team, team === 'CT' ? 'T' : 'CT', team === 'CT' ? 'T' : 'CT', team === 'CT' ? 'T' : 'CT'],
    health: [100, 100, 100, 72, 72],
    isAlive: [true, true, true, true, true],
    armor: [100, 100, 100, 82, 82],
    money: [800, 800, 3100, 3100, 3100],
    weapon: team === 'CT' ? ['m4a4', 'm4a4', 'ak-47', 'ak-47', 'ak-47'] : ['ak-47', 'ak-47', 'm4a4', 'm4a4', 'm4a4'],
    inventory: team === 'CT' ? [['m4a4', 'smoke'], ['m4a4'], ['ak-47'], ['ak-47'], ['ak-47']] : [['ak-47', 'flash'], ['ak-47'], ['m4a4'], ['m4a4'], ['m4a4']],
    hasHelmet: [true, true, true, true, true],
    hasDefuser: team === 'CT' ? [true, true, false, false, false] : [false, false, true, true, true],
  });
  return {
    meta: {
      viewerVersion: 'viewer-v1',
      schemaVersion: 'viewer-v1',
      parserVersion: '0.41.3',
      sampleStep: 8,
      tickRate: 64,
      totalTicks: 128,
      durationSeconds: 2,
      mapName: 'de_mirage',
      title: 'Synthetic Match',
      generatedAt: new Date().toISOString(),
      warnings: [],
    },
    warnings: [],
    bounds: { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 },
    teams: [
      { id: 'TEAM_A', name: 'Alpha', startingSide: 'CT', playerSteamIds: ['a1', 'a2'] },
      { id: 'TEAM_B', name: 'Bravo', startingSide: 'T', playerSteamIds: ['b1', 'b2'] },
    ],
    players: [
      { steamId: 'a1', name: 'Able', teamId: 'TEAM_A' },
      { steamId: 'a2', name: 'Arrow', teamId: 'TEAM_A' },
      { steamId: 'b1', name: 'Baker', teamId: 'TEAM_B' },
      { steamId: 'b2', name: 'Bolt', teamId: 'TEAM_B' },
    ],
    rounds: [
      { round: 1, startTick: 0, freezeEndTick: 8, endTick: 63, winner: 'CT', ctTeamId: 'TEAM_A', tTeamId: 'TEAM_B', ctTeamName: 'Alpha', tTeamName: 'Bravo' },
      { round: 2, startTick: 64, freezeEndTick: 72, endTick: 128, winner: 'T', ctTeamId: 'TEAM_B', tTeamId: 'TEAM_A', ctTeamName: 'Bravo', tTeamName: 'Alpha' },
    ],
    tracks: {
      ticksByPlayer: {
        a1: track('a1', 'Able', 'CT'),
        a2: track('a2', 'Arrow', 'CT'),
        b1: track('b1', 'Baker', 'T'),
        b2: track('b2', 'Bolt', 'T'),
      },
      shots: [{ tick: 100, shooterSteamId: 'a1', weapon: 'ak-47', x: 60, y: 180, endX: -400, endY: -250, didDamage: true }],
      impacts: [{ tick: 101, shooterSteamId: 'a1', x: -400, y: -250 }],
      hurts: [{ tick: 101, attackerSteamId: 'a1', victimSteamId: 'b1', healthDamage: 28, weapon: 'ak-47' }],
      blinds: [{ tick: 80, endTick: 104, attackerSteamId: 'b2', victimSteamId: 'a2', durationSec: 0.375 }],
      kills: [{ tick: 110, killerSteamId: 'a1', killerName: 'Able', killerTeam: 'T', killerTeamId: 'TEAM_A', victimSteamId: 'b1', victimName: 'Baker', victimTeam: 'CT', victimTeamId: 'TEAM_B', assisterSteamId: 'a2', assisterName: 'Arrow', assistedFlash: true, weapon: 'ak-47', headshot: true }],
      utilityThrows: [{ tick: 76, throwerSteamId: 'a2', throwerTeamId: 'TEAM_A', type: 'smoke', x: -120, y: 10 }],
      nades: [{ tick: 86, endTick: 120, throwerSteamId: 'a2', type: 'smoke', x: 0, y: 0, radius: 140 }],
      projectiles: [{ type: 'smoke', throwerSteamId: 'a2', startTick: 76, endTick: 86, points: [{ tick: 76, x: -120, y: 10 }, { tick: 86, x: 0, y: 0 }] }],
      bombs: [{ type: 'plant_start', tick: 92, playerSteamId: 'a1', x: 50, y: 75 }, { type: 'planted', tick: 96, playerSteamId: 'a1', site: 'A', x: 50, y: 75 }, { type: 'defused', tick: 124, playerSteamId: 'b2', x: 50, y: 75 }],
      doors: [{ type: 'door_open', tick: 106, x: 200, y: 150 }],
    },
  };
}

function prepareSession(localAppDataRoot, sourceMode) {
  const appRoot = path.join(localAppDataRoot, 'CS2DemoViewer');
  const cacheDir = path.join(appRoot, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const sourcePath = path.join(localAppDataRoot, 'source.dem');
  if (sourceMode === 'invalid') fs.writeFileSync(sourcePath, 'xx');
  const fingerprint = 'a'.repeat(64);
  const cacheFile = `${fingerprint}.viewer.json`;
  const serialized = JSON.stringify(syntheticBundle());
  fs.writeFileSync(path.join(cacheDir, cacheFile), serialized);
  fs.writeFileSync(path.join(appRoot, 'session.json'), `${JSON.stringify({
    schemaVersion: 1,
    active: {
      sourcePath: sourceMode === 'invalid' ? sourcePath : path.join(localAppDataRoot, 'missing-source.dem'),
      title: 'Synthetic Match',
      size: 1234,
      mtimeMs: 1,
      fingerprint,
      cacheFile,
      cacheBytes: Buffer.byteLength(serialized),
      cacheSha256: crypto.createHash('sha256').update(serialized).digest('hex'),
      mapName: 'de_mirage',
      durationSeconds: 2,
      warnings: ['Synthetic cached-only smoke bundle.'],
      generatedAt: new Date().toISOString(),
    },
    playback: { lastTick: 96, followSteamId: '', speed: 1 },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(appRoot, 'preferences.json'), `${JSON.stringify({
    schemaVersion: 1,
    audio: { muted: true, volume: 0.4 },
    visuals: { showTrails: true, showShots: true, showNades: true, showTeamCards: true, showPlayerLabels: true },
    mapLayouts: { de_mirage: { scale: 1.45, panX: -0.014, panY: 0.002, zoom: 0.74 } },
  }, null, 2)}\n`);
}

async function waitForDebugger(port, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_error) {
      // Electron is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for the Electron renderer debugger.');
}

function connectCdp(url) {
  const socket = new globalThis.WebSocket(url);
  let sequence = 0;
  const pending = new Map();
  const runtimeErrors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Renderer exception');
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const send = async (method, params = {}) => {
    await opened;
    const id = ++sequence;
    const response = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
    });
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed.');
    return result.result?.value;
  };
  return { socket, runtimeErrors, send, evaluate };
}

async function waitFor(predicate, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for renderer state.');
}

async function main() {
  const executable = path.resolve(argument('--app') || path.join(projectRoot, 'release', 'win-unpacked', 'CS2 Demo Viewer.exe'));
  assert.equal(fs.statSync(executable).isFile(), true, 'Electron executable must exist');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-electron-ui-smoke-'));
  const isolatedLocalAppData = path.join(temporaryRoot, 'local');
  const sourceMode = argument('--source-mode') || 'missing';
  if (!['missing', 'invalid'].includes(sourceMode)) throw new Error('--source-mode must be missing or invalid.');
  prepareSession(isolatedLocalAppData, sourceMode);
  const port = 19000 + (process.pid % 1000);
  const stderr = [];
  const child = spawn(executable, [`--remote-debugging-port=${port}`, '--enable-logging=stderr'], {
    cwd: projectRoot,
    env: { ...process.env, LOCALAPPDATA: isolatedLocalAppData },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  let cdp;
  try {
    const page = await waitForDebugger(port);
    cdp = connectCdp(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    const restored = await waitFor(() => cdp.evaluate(`(() => {
      const title = document.querySelector('#demoTitle')?.textContent || '';
      if (title !== 'Synthetic Match') return null;
      return {
        title,
        emptyHidden: document.querySelector('#emptyState')?.classList.contains('hidden'),
        controlsEnabled: !document.querySelector('#playPauseBtn')?.disabled,
        rebuildDisabled: document.querySelector('#rebuildDemoBtn')?.disabled,
        mapStatus: document.querySelector('#mapStatus')?.textContent,
        teamCards: document.querySelectorAll('.team-card').length,
        warningText: document.querySelector('#warningsBtn')?.textContent,
        tick: Number(document.querySelector('#tickInput')?.value),
      };
    })()`));
    assert.equal(restored.emptyHidden, true);
    assert.equal(restored.controlsEnabled, true);
    assert.equal(restored.rebuildDisabled, sourceMode === 'missing');
    assert.match(restored.mapStatus, /loaded/i);
    assert.equal(restored.teamCards, 2);
    assert.match(restored.warningText, /warning/i);
    assert.equal(restored.tick, 96);

    const stats = await cdp.evaluate(`(() => {
      document.querySelector('.team-card')?.click();
      document.querySelector('[data-stats-scope="full"]')?.click();
      document.querySelector('[data-stats-category="utility"]')?.click();
      return {
        overlayOpen: !document.querySelector('#statsOverlay')?.classList.contains('hidden'),
        title: document.querySelector('#statsTitle')?.textContent,
        rows: document.querySelectorAll('#statsContent tbody tr').length,
        scopeActive: document.querySelector('[data-stats-scope="full"]')?.classList.contains('is-active'),
      };
    })()`);
    assert.equal(stats.overlayOpen, true);
    assert.match(stats.title, /Alpha statistics/);
    assert.ok(stats.rows >= 4);
    assert.equal(stats.scopeActive, true);

    const scoreboard = await cdp.evaluate(`(() => {
      document.querySelector('#closeStatsBtn')?.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
      const open = !document.querySelector('#scoreboard')?.classList.contains('hidden');
      const rows = document.querySelectorAll('#scoreboard .scoreboard-player-row').length;
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
      return { open, rows };
    })()`);
    assert.equal(scoreboard.open, true);
    assert.equal(scoreboard.rows, 4);

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(cdp.runtimeErrors, []);
    console.log(JSON.stringify({ sourceMode, restored, stats, scoreboard, runtimeErrors: cdp.runtimeErrors }, null, 2));
    await cdp.send('Browser.close').catch(() => {});
  } finally {
    if (cdp?.socket?.readyState === globalThis.WebSocket.OPEN) cdp.socket.close();
    if (!child.killed) child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); break; }
      catch (_error) { await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
  }
  const fatalLog = stderr.join('').split(/\r?\n/).filter((line) => /uncaught|unhandled|fatal|ERR_FILE_NOT_FOUND|ERR_FAILED/i.test(line));
  assert.deepEqual(fatalLog, []);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
