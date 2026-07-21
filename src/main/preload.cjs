'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const bridge = Object.freeze({
  openDemo: () => ipcRenderer.invoke('viewer:open-demo'),
  restoreSession: () => ipcRenderer.invoke('viewer:restore-session'),
  rebuildActiveDemo: () => ipcRenderer.invoke('viewer:rebuild-active-demo'),
  cancelParse: () => ipcRenderer.invoke('viewer:cancel-parse'),
  saveSessionPatch: (state) => ipcRenderer.invoke('viewer:save-session-patch', state),
  getAudioCatalog: () => ipcRenderer.invoke('viewer:get-audio-catalog'),
  onParseProgress(callback) {
    if (typeof callback !== 'function') throw new TypeError('Parse progress listener must be a function.');
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('viewer:parse-progress', listener);
    return () => ipcRenderer.removeListener('viewer:parse-progress', listener);
  },
});

contextBridge.exposeInMainWorld('cs2Viewer', bridge);
