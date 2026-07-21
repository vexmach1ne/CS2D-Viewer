'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  utilityProcess,
} = require('electron');
const { buildAudioCatalog } = require('./audio-catalog.cjs');
const { commitTemporaryCache } = require('./cache-transaction.cjs');
const {
  DEFAULT_SAMPLE_STEP,
  applyStatePatch,
  cachePathForFingerprint,
  createStoragePaths,
  getDemoIdentity,
  hashFile,
  pruneCaches,
  readPreferences,
  readSession,
  saveSession,
  validateActiveCache,
} = require('./state-store.cjs');
const { resolveAllowedAssetPath, validateStatePatchPayload } = require('./protocol-paths.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'viewer-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'viewer-data', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const storageRoot = path.join(localAppData, 'CS2DemoViewer');
app.setName('CS2 Demo Viewer');
app.setPath('userData', path.join(storageRoot, 'runtime'));
app.setPath('sessionData', path.join(storageRoot, 'runtime-cache'));

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let activeBundlePath = null;
let audioCatalog = null;
const storagePaths = createStoragePaths(storageRoot);

function assetRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(app.getAppPath(), 'assets');
}

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  return warnings
    .map((warning) => {
      if (typeof warning === 'string') return warning;
      if (!warning || typeof warning !== 'object') return String(warning || '');
      const stage = warning.stage ? `${warning.stage}: ` : '';
      return `${stage}${warning.message || warning.code || 'Partial demo data warning'}`;
    })
    .filter(Boolean)
    .slice(0, 100);
}

function sendParseProgress(progress) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('viewer:parse-progress', progress);
}

function buildDescriptor(session, options = {}) {
  const active = session.active;
  if (!active) return null;
  const sourceAvailable = options.sourceAvailable !== false;
  return {
    demo: {
      title: active.title,
      path: active.sourcePath,
      size: active.size,
      mtimeMs: active.mtimeMs,
      mapName: active.mapName,
      durationSeconds: active.durationSeconds,
    },
    bundleUrl: 'viewer-data://active/bundle.json',
    fromCache: Boolean(options.fromCache),
    sourceAvailable,
    warnings: [...normalizeWarnings(active.warnings), ...normalizeWarnings(options.warnings)],
    session: { ...session.playback },
    preferences: readPreferences(storagePaths),
    cache: { fingerprint: active.fingerprint, generatedAt: active.generatedAt },
  };
}

function removeFileBestEffort(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (_error) { /* Derived temporary cache only. */ }
}

class ParseCoordinator {
  constructor() {
    this.job = null;
  }

  cancel() {
    if (!this.job) return false;
    this.job.cancelled = true;
    this.job.child.kill();
    return true;
  }

  async load(sourcePath, forceRebuild = false) {
    if (this.job) throw new Error('A demo parse is already in progress.');
    const identity = getDemoIdentity(sourcePath, DEFAULT_SAMPLE_STEP);
    const currentSession = readSession(storagePaths);
    if (!forceRebuild && currentSession.active?.fingerprint === identity.fingerprint) {
      const cache = await validateActiveCache(storagePaths, currentSession.active);
      if (cache.valid) {
        activeBundlePath = cache.cachePath;
        sendParseProgress({ stage: 'cache', progress: 1, percent: 100, message: 'Loaded cached viewer bundle' });
        return buildDescriptor(currentSession, { fromCache: true, sourceAvailable: true });
      }
    }

    const finalPath = cachePathForFingerprint(storagePaths, identity.fingerprint);
    const tempPath = path.join(
      storagePaths.cacheDir,
      `${identity.fingerprint}-${process.pid}-${Date.now()}.viewer.json.tmp`
    );
    sendParseProgress({ stage: 'starting', progress: 0, percent: 0, message: 'Starting isolated demo parser' });

    return new Promise((resolve, reject) => {
      const request = JSON.stringify({
        sourcePath: identity.sourcePath,
        outputPath: tempPath,
        title: identity.title,
        sampleStep: identity.sampleStep,
      });
      const child = utilityProcess.fork(path.join(__dirname, 'parse-worker.cjs'), [request], {
        serviceName: 'CS2 Demo Parser',
        stdio: 'ignore',
      });
      const job = { child, cancelled: false, finishing: false, tempPath };
      this.job = job;

      const fail = (error) => {
        if (this.job === job) this.job = null;
        removeFileBestEffort(tempPath);
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      child.on('message', (message) => {
        if (!message || typeof message !== 'object' || this.job !== job) return;
        if (message.type === 'progress') {
          sendParseProgress(message.progress);
          return;
        }
        if (message.type === 'error') {
          fail(new Error(String(message.error || 'The parser failed.')));
          return;
        }
        if (message.type !== 'complete' || job.finishing) return;
        job.finishing = true;
        void (async () => {
          try {
            if (job.cancelled) throw Object.assign(new Error('Demo parsing was cancelled.'), { code: 'PARSE_CANCELLED' });
            const result = message.result || {};
            const temporaryStat = fs.statSync(tempPath);
            const actualHash = await hashFile(tempPath);
            if (job.cancelled) throw Object.assign(new Error('Demo parsing was cancelled.'), { code: 'PARSE_CANCELLED' });
            if (!temporaryStat.isFile() || Number(result.cacheBytes) !== Number(temporaryStat.size)) {
              throw new Error('The parser produced an incomplete cache file.');
            }
            if (!/^[a-f0-9]{64}$/.test(String(result.cacheSha256 || '')) || result.cacheSha256 !== actualHash) {
              throw new Error('The parser cache checksum did not match.');
            }
            commitTemporaryCache(tempPath, finalPath);
            const parserWarnings = normalizeWarnings(result.warnings || result.meta?.warnings);
            const previousSession = readSession(storagePaths);
            const session = saveSession(storagePaths, {
              ...previousSession,
              active: {
                sourcePath: identity.sourcePath,
                title: identity.title,
                size: identity.size,
                mtimeMs: identity.mtimeMs,
                fingerprint: identity.fingerprint,
                cacheFile: path.basename(finalPath),
                cacheBytes: temporaryStat.size,
                cacheSha256: actualHash,
                mapName: String(result.meta?.mapName || ''),
                durationSeconds: Math.max(0, Number(result.meta?.durationSeconds || 0)),
                warnings: parserWarnings,
                generatedAt: String(result.meta?.generatedAt || new Date().toISOString()),
              },
            });
            activeBundlePath = finalPath;
            pruneCaches(storagePaths, path.basename(finalPath));
            if (this.job === job) this.job = null;
            sendParseProgress({ stage: 'complete', progress: 1, percent: 100, message: 'Demo ready' });
            resolve(buildDescriptor(session, { fromCache: false, sourceAvailable: true }));
          } catch (error) {
            fail(error);
          }
        })();
      });

      child.once('error', fail);
      child.once('exit', (code) => {
        if (this.job !== job || job.finishing) return;
        if (job.cancelled) {
          fail(Object.assign(new Error('Demo parsing was cancelled.'), { code: 'PARSE_CANCELLED' }));
        } else {
          fail(new Error(`The parser process exited before producing a bundle (exit ${code ?? 'unknown'}).`));
        }
      });
    });
  }
}

const parser = new ParseCoordinator();

async function restoreSession() {
  const session = readSession(storagePaths);
  if (!session.active) return null;
  const cache = await validateActiveCache(storagePaths, session.active);
  if (!cache.valid) {
    removeFileBestEffort(cache.cachePath);
    activeBundlePath = null;
    saveSession(storagePaths, { ...session, active: null });
    sendParseProgress({
      stage: 'restore', progress: 0, percent: 0,
      message: 'The saved cache was corrupt or incompatible. Open the source demo again.',
    });
    return null;
  }

  activeBundlePath = cache.cachePath;
  pruneCaches(storagePaths, session.active.cacheFile);
  const sourceAvailable = fs.existsSync(session.active.sourcePath);
  if (!sourceAvailable) {
    return buildDescriptor(session, {
      fromCache: true,
      sourceAvailable: false,
      warnings: ['The source .dem file is missing. Cached-only playback is available; rebuild is disabled.'],
    });
  }

  let currentIdentity;
  try {
    currentIdentity = getDemoIdentity(session.active.sourcePath, DEFAULT_SAMPLE_STEP);
  } catch (_error) {
    return buildDescriptor(session, { fromCache: true, sourceAvailable: false, warnings: ['The source demo cannot be read.'] });
  }
  if (currentIdentity.fingerprint !== session.active.fingerprint) {
    try {
      return await parser.load(session.active.sourcePath, true);
    } catch (error) {
      activeBundlePath = cache.cachePath;
      const message = error instanceof Error ? error.message : String(error);
      return buildDescriptor(session, {
        fromCache: true,
        sourceAvailable: true,
        warnings: [`The source demo changed, but its automatic rebuild failed (${message}). The previous valid cache is still active.`],
      });
    }
  }
  return buildDescriptor(session, { fromCache: true, sourceAvailable: true });
}

function registerProtocols() {
  protocol.handle('viewer-asset', async (request) => {
    const filePath = resolveAllowedAssetPath(assetRoot(), request.url);
    if (!filePath || !fs.existsSync(filePath)) return new Response('Asset not found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  protocol.handle('viewer-data', async (request) => {
    let parsed;
    try { parsed = new URL(request.url); } catch (_error) { return new Response('Not found', { status: 404 }); }
    if (parsed.hostname !== 'active' || parsed.pathname !== '/bundle.json' || !activeBundlePath) {
      return new Response('Not found', { status: 404 });
    }
    if (!fs.existsSync(activeBundlePath)) return new Response('Bundle unavailable', { status: 404 });
    return net.fetch(pathToFileURL(activeBundlePath).toString());
  });
}

function registerIpc() {
  ipcMain.handle('viewer:open-demo', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open CS2 demo',
      properties: ['openFile'],
      filters: [{ name: 'Counter-Strike 2 demos', extensions: ['dem'] }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return parser.load(result.filePaths[0], false);
  });
  ipcMain.handle('viewer:restore-session', () => restoreSession());
  ipcMain.handle('viewer:rebuild-active-demo', async () => {
    const session = readSession(storagePaths);
    if (!session.active) throw new Error('There is no active demo to rebuild.');
    if (!fs.existsSync(session.active.sourcePath)) throw new Error('The source .dem file is missing; cached playback cannot be rebuilt.');
    return parser.load(session.active.sourcePath, true);
  });
  ipcMain.handle('viewer:cancel-parse', () => parser.cancel());
  ipcMain.handle('viewer:save-session-patch', (_event, patch) => {
    validateStatePatchPayload(patch);
    return applyStatePatch(storagePaths, patch);
  });
  ipcMain.handle('viewer:get-audio-catalog', () => {
    if (!audioCatalog) audioCatalog = buildAudioCatalog(assetRoot());
    return audioCatalog;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#060a0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.cs2demoviewer.app');
    Menu.setApplicationMenu(null);
    registerProtocols();
    registerIpc();
    createWindow();
  }).catch((error) => {
    dialog.showErrorBox('CS2 Demo Viewer failed to start', error instanceof Error ? error.message : String(error));
    app.quit();
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => parser.cancel());
