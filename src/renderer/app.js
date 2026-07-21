// @ts-check

import { computeMatchStats } from './stats.js';
import {
  activeBombAtTick,
  floorIndex,
  jumpRoundTick,
  maxTrackTick,
  resetEventCursors,
  resolveSeek,
  roundIndexAtTick as findRoundIndexAtTick,
  samplePlayerTrack,
} from './playback-model.js';

/** @typedef {'CT'|'T'|'?'} Side */
/**
 * @typedef {object} DemoDescriptor
 * @property {{title?:string,path?:string,size?:number,mtimeMs?:number,mapName?:string,durationSeconds?:number}} demo
 * @property {string} bundleUrl
 * @property {boolean} fromCache
 * @property {boolean} sourceAvailable
 * @property {string[]} warnings
 * @property {{lastTick?:number,followSteamId?:string,speed?:number}} session
 * @property {ViewerPreferences=} preferences
 */
/**
 * @typedef {object} ViewerPreferences
 * @property {{volume?:number,muted?:boolean}=} audio
 * @property {{labels?:boolean,trails?:boolean,shots?:boolean,nades?:boolean,teamCards?:boolean}=} visual
 * @property {Record<string,{scale:number,panX:number,panY:number,zoom:number}>=} mapLayouts
 */
/**
 * @typedef {object} ViewerBundle
 * @property {Record<string, any>} meta
 * @property {{minX:number,maxX:number,minY:number,maxY:number}} bounds
 * @property {Array<{steamId:string,name:string,teamId?:string}>} players
 * @property {Array<Record<string, any>>} teams
 * @property {Array<Record<string, any>>} rounds
 * @property {Record<string, any>} tracks
 */
/** @typedef {{scale:number,panX:number,panY:number,zoom:number}} MapLayout */

const bridge = /** @type {Window & {cs2Viewer?: any}} */ (window).cs2Viewer;

const dom = {
  openDemoBtn: document.querySelector('#openDemoBtn'),
  emptyOpenBtn: document.querySelector('#emptyOpenBtn'),
  rebuildDemoBtn: document.querySelector('#rebuildDemoBtn'),
  cancelParseBtn: document.querySelector('#cancelParseBtn'),
  demoTitle: document.querySelector('#demoTitle'),
  demoSubtitle: document.querySelector('#demoSubtitle'),
  demoMeta: document.querySelector('#demoMeta'),
  playPauseBtn: document.querySelector('#playPauseBtn'),
  playPauseGlyph: document.querySelector('#playPauseGlyph'),
  playPauseText: document.querySelector('#playPauseText'),
  prevRoundBtn: document.querySelector('#prevRoundBtn'),
  nextRoundBtn: document.querySelector('#nextRoundBtn'),
  speedSelect: document.querySelector('#speedSelect'),
  followSelect: document.querySelector('#followSelect'),
  timelineInput: document.querySelector('#timelineInput'),
  tickInput: document.querySelector('#tickInput'),
  timeLabel: document.querySelector('#timeLabel'),
  roundLabel: document.querySelector('#roundLabel'),
  roundMarkers: document.querySelector('#roundMarkers'),
  viewerCanvas: document.querySelector('#viewerCanvas'),
  canvasWrap: document.querySelector('#canvasWrap'),
  clockLabel: document.querySelector('#clockLabel'),
  matchScoreLabel: document.querySelector('#matchScoreLabel'),
  teamCards: document.querySelector('#teamCards'),
  killFeed: document.querySelector('#killFeed'),
  scoreboard: document.querySelector('#scoreboard'),
  emptyState: document.querySelector('#emptyState'),
  loadingOverlay: document.querySelector('#loadingOverlay'),
  loadingStage: document.querySelector('#loadingStage'),
  loadingPercent: document.querySelector('#loadingPercent'),
  loadingProgress: document.querySelector('#loadingProgress'),
  loadingMessage: document.querySelector('#loadingMessage'),
  showLabelsToggle: document.querySelector('#showLabelsToggle'),
  showTrailsToggle: document.querySelector('#showTrailsToggle'),
  showShotsToggle: document.querySelector('#showShotsToggle'),
  showNadesToggle: document.querySelector('#showNadesToggle'),
  showTeamCardsToggle: document.querySelector('#showTeamCardsToggle'),
  audioMuteBtn: document.querySelector('#audioMuteBtn'),
  audioMuteGlyph: document.querySelector('#audioMuteGlyph'),
  audioVolumeInput: document.querySelector('#audioVolumeInput'),
  audioVolumeText: document.querySelector('#audioVolumeText'),
  mapScaleInput: document.querySelector('#mapScaleInput'),
  mapScaleOutput: document.querySelector('#mapScaleOutput'),
  mapPanXInput: document.querySelector('#mapPanXInput'),
  mapPanXOutput: document.querySelector('#mapPanXOutput'),
  mapPanYInput: document.querySelector('#mapPanYInput'),
  mapPanYOutput: document.querySelector('#mapPanYOutput'),
  mapZoomInput: document.querySelector('#mapZoomInput'),
  mapZoomOutput: document.querySelector('#mapZoomOutput'),
  saveMapLayoutBtn: document.querySelector('#saveMapLayoutBtn'),
  resetMapLayoutBtn: document.querySelector('#resetMapLayoutBtn'),
  mapStatus: document.querySelector('#mapStatus'),
  nukeLayerToggle: document.querySelector('#nukeLayerToggle'),
  nukeLayerABtn: document.querySelector('#nukeLayerABtn'),
  nukeLayerBBtn: document.querySelector('#nukeLayerBBtn'),
  statsOverlay: document.querySelector('#statsOverlay'),
  statsTitle: document.querySelector('#statsTitle'),
  statsScopeTabs: document.querySelector('#statsScopeTabs'),
  statsCategoryTabs: document.querySelector('#statsCategoryTabs'),
  statsMeta: document.querySelector('#statsMeta'),
  statsContent: document.querySelector('#statsContent'),
  closeStatsBtn: document.querySelector('#closeStatsBtn'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  warningsBtn: document.querySelector('#warningsBtn'),
  warningsPanel: document.querySelector('#warningsPanel'),
};

const MAP_LAYOUT_DEFAULTS = Object.freeze({
  de_ancient: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_anubis: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_dust2: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_inferno: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_mirage: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_nuke: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
  de_overpass: Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 }),
});

// CS2 overview.txt transforms: the 1024px radar images map to this world rectangle.
const MAP_OVERVIEWS = Object.freeze({
  de_ancient: Object.freeze({ minX: -2953, maxX: 2167, minY: -2956, maxY: 2164 }),
  de_anubis: Object.freeze({ minX: -2796, maxX: 2549.28, minY: -2017.28, maxY: 3328 }),
  de_dust2: Object.freeze({ minX: -2400, maxX: 2105.6, minY: -1122.6, maxY: 3383 }),
  de_inferno: Object.freeze({ minX: -2087, maxX: 2930.6, minY: -1147.6, maxY: 3870 }),
  de_mirage: Object.freeze({ minX: -3230, maxX: 1890, minY: -3407, maxY: 1713 }),
  de_nuke: Object.freeze({ minX: -3453, maxX: 3715, minY: -4281, maxY: 2887 }),
  de_overpass: Object.freeze({ minX: -4831, maxX: 493.8, minY: -3543.8, maxY: 1781 }),
});

const AVAILABLE_MAPS = new Set(['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 'de_overpass']);
const SPEEDS = new Set([0.25, 0.5, 1, 1.5, 2, 4]);
const PLAYER_DAMAGE_FLASH_TICKS = 16;
const CLOCK_DEFAULTS = Object.freeze({ roundTimeSec: 115, bombTimeSec: 40, freezeTimeSec: 15 });
const EMPTY_LAYOUT = Object.freeze({ scale: 1, panX: 0, panY: 0, zoom: 1 });

const PRIMARY_WEAPONS = new Set([
  'ak-47', 'aug', 'awp', 'famas', 'g3sg1', 'galil', 'galil ar', 'm249', 'm4a1-s', 'm4a4', 'mac-10', 'mag-7',
  'mp5-sd', 'mp7', 'mp9', 'negev', 'nova', 'p90', 'pp-bizon', 'sawed-off', 'scar-20', 'sg 553', 'ssg 08', 'ump-45',
  'xm1014',
]);

const DEFAULT_AUDIO_CONFIG = Object.freeze({
  master: 1,
  groups: Object.freeze({
    weapons: 0.5, c4Initiate: 0.45, c4PlantFinish: 0.45, c4DefuseStart: 0.45, c4DefuseFinish: 0.45,
    c4Explode: 0.45, bombBeepA: 0.35, bombBeepATen: 0.35, bombBeepB: 0.35, bombBeepBTen: 0.35,
    roundWin: 0.45, flashExplode: 0.45, smoke: 0.4, smokeEmit: 0.4, molotov: 0.45, molotovLoop: 0.35,
    molotovLoopFade: 0.35, molotovExtinguish: 0.4, heExplode: 0.45, damageKevlar: 0.35, damageBurn: 0.35,
    damageHeadshot: 0.38, doorOpen: 0.45,
  }),
  weapons: Object.freeze({ default: 1, distant: 1, close: 0.4, awp: 1.3, pistols: 0.6 }),
  damageCooldownMs: 500,
});

const state = {
  /** @type {DemoDescriptor|null} */ descriptor: null,
  /** @type {ViewerBundle|null} */ bundle: null,
  tick: 0,
  tickFloat: 0,
  playing: false,
  speed: 1,
  followSteamId: '',
  playerState: /** @type {Record<string, any>} */ ({}),
  lastPlayerState: /** @type {Record<string, any>} */ ({}),
  damageFlashEnds: /** @type {Record<string, number>} */ ({}),
  blindByPlayer: /** @type {Record<string, Array<{tick:number,endTick:number}>>} */ ({}),
  cameraPanX: 0,
  cameraPanY: 0,
  mapKey: '',
  mapLayout: /** @type {MapLayout} */ ({ ...EMPTY_LAYOUT }),
  mapLayouts: /** @type {Record<string, MapLayout>} */ ({}),
  mapImage: /** @type {HTMLImageElement|null} */ (null),
  nukeImages: /** @type {{A:HTMLImageElement|null,B:HTMLImageElement|null}} */ ({ A: null, B: null }),
  nukeLayer: /** @type {'A'|'B'} */ ('A'),
  showLabels: true,
  showWeapons: false,
  showTrails: true,
  showShots: true,
  showNades: true,
  showTeamCards: true,
  scoreboardOpen: false,
  statsOpen: false,
  statsResume: false,
  statsScope: /** @type {'current'|'full'} */ ('current'),
  statsCategory: /** @type {'general'|'performance'|'utility'} */ ('general'),
  statsFocusTeamId: '',
  statsCache: /** @type {Map<string, any>} */ (new Map()),
  loading: false,
  warnings: /** @type {string[]} */ ([]),
  audioCatalog: /** @type {any} */ (null),
  audioConfig: /** @type {any} */ (DEFAULT_AUDIO_CONFIG),
  audioContext: /** @type {AudioContext|null} */ (null),
  audioMaster: /** @type {GainNode|null} */ (null),
  audioBuffers: /** @type {Map<string,AudioBuffer|null>} */ (new Map()),
  audioCursors: { shots: 0, nades: 0, bombs: 0, hurts: 0, doors: 0, rounds: 0 },
  audioSuppressedUntilMs: 0,
  timelineScrubbing: false,
  audioGeneration: 0,
  activeAudioSources: /** @type {Set<AudioScheduledSourceNode>} */ (new Set()),
  audioRoundRobin: /** @type {Record<string,number>} */ ({}),
  audioVolume: 0.85,
  audioMuted: false,
  audioLastDamageMs: 0,
  audioLastDoorMs: 0,
  bombAudio: /** @type {null|{endTick:number,roundEndTick:number,nextBeepTick:number,x:number,y:number,site:'A'|'B'}} */ (null),
  activeMolotovSources: /** @type {AudioScheduledSourceNode[]} */ ([]),
  frameId: 0,
  lastFrameMs: 0,
  sessionSaveTimer: 0,
  panDrag: /** @type {null|{x:number,y:number,panX:number,panY:number}} */ (null),
  lastRightClick: { at: 0, x: 0, y: 0 },
  resizeObserver: /** @type {ResizeObserver|null} */ (null),
};

function array(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function assetUrl(category, relativePath) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return `viewer-asset://${category}/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(finite(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function normalizeMapKey(value) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.(dem|json)$/g, '')
    .replace(/[^a-z0-9_]/g, '');
  if (!clean) return '';
  if (clean.startsWith('de_') || clean.startsWith('cs_') || clean.startsWith('workshop')) return clean;
  return `de_${clean}`;
}

/** @returns {Side} */
function normalizeSide(value) {
  const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (clean === 'CT' || clean.includes('COUNTERTERRORIST')) return 'CT';
  if (clean === 'T' || clean === 'TERRORIST' || clean === 'TERRORISTS') return 'T';
  const numeric = Number(value);
  if (numeric === 3) return 'CT';
  if (numeric === 2) return 'T';
  return '?';
}

function setStatus(message, kind = 'neutral') {
  if (dom.statusText) dom.statusText.textContent = message;
  if (dom.statusDot instanceof HTMLElement) {
    if (kind === 'neutral') delete dom.statusDot.dataset.status;
    else dom.statusDot.dataset.status = kind;
  }
}

function setLoading(visible, progress = {}) {
  state.loading = Boolean(visible);
  dom.loadingOverlay?.classList.toggle('hidden', !visible);
  const percent = clamp(progress.percent ?? 0, 0, 100);
  if (dom.loadingProgress instanceof HTMLProgressElement) dom.loadingProgress.value = percent;
  if (dom.loadingPercent) dom.loadingPercent.textContent = `${Math.round(percent)}%`;
  if (dom.loadingStage && progress.stage) dom.loadingStage.textContent = String(progress.stage);
  if (dom.loadingMessage && progress.message) dom.loadingMessage.textContent = String(progress.message);
  if (dom.openDemoBtn instanceof HTMLButtonElement) dom.openDemoBtn.disabled = visible;
  if (dom.rebuildDemoBtn instanceof HTMLButtonElement) dom.rebuildDemoBtn.disabled = visible || !state.descriptor?.sourceAvailable;
}

function setControlsEnabled(enabled) {
  for (const element of [dom.playPauseBtn, dom.prevRoundBtn, dom.nextRoundBtn, dom.speedSelect, dom.followSelect, dom.timelineInput, dom.tickInput]) {
    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      element.disabled = !enabled;
    }
  }
  if (dom.saveMapLayoutBtn instanceof HTMLButtonElement) dom.saveMapLayoutBtn.disabled = !enabled || !state.mapKey;
  if (dom.resetMapLayoutBtn instanceof HTMLButtonElement) dom.resetMapLayoutBtn.disabled = !enabled || !state.mapKey;
}

function showWarnings(warnings) {
  state.warnings = Array.from(new Set(array(warnings).map((row) => String(row || '').trim()).filter(Boolean)));
  if (dom.warningsBtn) {
    dom.warningsBtn.textContent = state.warnings.length === 1 ? '1 parse warning' : `${state.warnings.length} parse warnings`;
    dom.warningsBtn.classList.toggle('hidden', !state.warnings.length);
  }
  if (dom.warningsPanel) {
    dom.warningsPanel.innerHTML = state.warnings.length
      ? `<ul>${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
      : '';
    dom.warningsPanel.classList.add('hidden');
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });
}

function weaponKind(name) {
  const value = String(name || '').toLowerCase();
  if (/c4|bomb/.test(value)) return 'bomb';
  if (/knife/.test(value)) return 'knife';
  if (/flash|smoke|molotov|incendiary|decoy|^he$/.test(value)) return 'utility';
  if (/awp|g3sg1|scar|ssg/.test(value)) return 'long';
  if (/glock|usp|p2000|p250|deagle|five|tec|cz|revolver|elite/.test(value)) return 'sidearm';
  return 'rifle';
}
function weaponSvg(name) {
  const kind = weaponKind(name); const label = escapeHtml(String(name || 'weapon'));
  const paths = kind === 'bomb' ? '<rect x="6" y="7" width="20" height="14" rx="2"/><path d="M11 7V4h10v3m-7 4h4m-6 5h8"/>' :
    kind === 'knife' ? '<path d="M7 22L24 5l2 2-17 17H7v-2zM17 14l4 4"/>' :
    kind === 'utility' ? '<circle cx="16" cy="16" r="8"/><path d="M16 8V4m-3 0h6"/>' :
    kind === 'sidearm' ? '<path d="M6 12h18v5h-4l-2 7h-4l1-7H9l-1 4H5z"/>' :
    kind === 'long' ? '<path d="M3 15h26M9 12h12v3H9zM22 13h5v2M10 15l-2 8m8-8l3 8"/>' :
    '<path d="M4 13h22v4h-7l-2 7h-4l1-7H9l-2 4H4zM12 10h8v3h-8z"/>';
  return `<svg class="original-weapon-svg" viewBox="0 0 32 32" role="img" aria-label="${label}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
function drawWeaponGlyph(context, name, x, y, width = 26, height = 16) {
  const kind = weaponKind(name); const sx = width / 32; const sy = height / 32;
  context.save(); context.translate(x, y); context.scale(sx, sy); context.strokeStyle = '#e7edf4'; context.fillStyle = '#e7edf4'; context.lineWidth = 2; context.lineCap = 'round'; context.lineJoin = 'round';
  if (kind === 'bomb') { context.strokeRect(6, 7, 20, 14); context.beginPath(); context.moveTo(11, 7); context.lineTo(11, 4); context.lineTo(21, 4); context.lineTo(21, 7); context.moveTo(14, 12); context.lineTo(18, 12); context.moveTo(12, 17); context.lineTo(20, 17); context.stroke(); }
  else if (kind === 'knife') { context.beginPath(); context.moveTo(7, 22); context.lineTo(24, 5); context.lineTo(26, 7); context.lineTo(9, 24); context.lineTo(7, 24); context.closePath(); context.stroke(); }
  else if (kind === 'utility') { context.beginPath(); context.arc(16, 16, 8, 0, Math.PI * 2); context.moveTo(16, 8); context.lineTo(16, 4); context.moveTo(13, 4); context.lineTo(19, 4); context.stroke(); }
  else { context.beginPath(); context.moveTo(4, 13); context.lineTo(26, 13); context.lineTo(26, 17); context.lineTo(19, 17); context.lineTo(17, 24); context.lineTo(13, 24); context.lineTo(14, 17); context.lineTo(9, 17); context.lineTo(7, 21); context.lineTo(4, 21); context.closePath(); context.stroke(); if (kind === 'long') { context.moveTo(3, 15); context.lineTo(29, 15); } context.stroke(); }
  context.restore();
}

/** @param {any} value @param {MapLayout} [fallback] @returns {MapLayout} */
function sanitizeLayout(value, fallback = EMPTY_LAYOUT) {
  return {
    scale: clamp(value?.scale ?? fallback.scale, 0.4, 2.4),
    panX: clamp(value?.panX ?? fallback.panX, -0.8, 0.8),
    panY: clamp(value?.panY ?? fallback.panY, -0.8, 0.8),
    zoom: clamp(value?.zoom ?? fallback.zoom, 0.5, 3),
  };
}

function currentPreferences() {
  return {
    audio: { volume: state.audioVolume, muted: state.audioMuted },
    visuals: {
      showPlayerLabels: state.showLabels,
      showTrails: state.showTrails,
      showShots: state.showShots,
      showNades: state.showNades,
      showTeamCards: state.showTeamCards,
    },
    mapLayouts: state.mapLayouts,
  };
}

function applyPreferences(preferences) {
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  state.audioVolume = clamp(prefs.audio?.volume ?? state.audioVolume, 0, 1);
  state.audioMuted = Boolean(prefs.audio?.muted ?? state.audioMuted);
  const visuals = prefs.visuals || prefs.visual || {};
  state.showLabels = Boolean(visuals.showPlayerLabels ?? visuals.labels ?? state.showLabels);
  state.showTrails = Boolean(visuals.showTrails ?? visuals.trails ?? state.showTrails);
  state.showShots = Boolean(visuals.showShots ?? visuals.shots ?? state.showShots);
  state.showNades = Boolean(visuals.showNades ?? visuals.nades ?? state.showNades);
  state.showTeamCards = Boolean(visuals.showTeamCards ?? visuals.teamCards ?? state.showTeamCards);
  state.mapLayouts = {};
  if (prefs.mapLayouts && typeof prefs.mapLayouts === 'object') {
    for (const [key, value] of Object.entries(prefs.mapLayouts)) {
      const mapKey = normalizeMapKey(key);
      if (mapKey) state.mapLayouts[mapKey] = sanitizeLayout(value);
    }
  }
  syncPreferenceControls();
}

function syncPreferenceControls() {
  if (dom.showLabelsToggle instanceof HTMLInputElement) dom.showLabelsToggle.checked = state.showLabels;
  if (dom.showTrailsToggle instanceof HTMLInputElement) dom.showTrailsToggle.checked = state.showTrails;
  if (dom.showShotsToggle instanceof HTMLInputElement) dom.showShotsToggle.checked = state.showShots;
  if (dom.showNadesToggle instanceof HTMLInputElement) dom.showNadesToggle.checked = state.showNades;
  if (dom.showTeamCardsToggle instanceof HTMLInputElement) dom.showTeamCardsToggle.checked = state.showTeamCards;
  if (dom.audioVolumeInput instanceof HTMLInputElement) dom.audioVolumeInput.value = String(state.audioVolume);
  if (dom.audioVolumeText) dom.audioVolumeText.textContent = `${Math.round(state.audioVolume * 100)}%`;
  dom.audioMuteBtn?.classList.toggle('is-muted', state.audioMuted);
  dom.audioMuteBtn?.setAttribute('aria-pressed', state.audioMuted ? 'true' : 'false');
  if (dom.audioMuteGlyph) dom.audioMuteGlyph.textContent = state.audioMuted ? '🔇' : '🔊';
  updateAudioMasterGain();
}

function syncMapControls() {
  const layout = state.mapLayout;
  if (dom.mapScaleInput instanceof HTMLInputElement) dom.mapScaleInput.value = String(layout.scale);
  if (dom.mapPanXInput instanceof HTMLInputElement) dom.mapPanXInput.value = String(layout.panX);
  if (dom.mapPanYInput instanceof HTMLInputElement) dom.mapPanYInput.value = String(layout.panY);
  if (dom.mapZoomInput instanceof HTMLInputElement) dom.mapZoomInput.value = String(layout.zoom);
  if (dom.mapScaleOutput) dom.mapScaleOutput.textContent = layout.scale.toFixed(2);
  if (dom.mapPanXOutput) dom.mapPanXOutput.textContent = layout.panX.toFixed(3);
  if (dom.mapPanYOutput) dom.mapPanYOutput.textContent = layout.panY.toFixed(3);
  if (dom.mapZoomOutput) dom.mapZoomOutput.textContent = layout.zoom.toFixed(2);
}

function scheduleSessionSave(immediate = false) {
  if (!bridge?.saveSessionPatch || !state.bundle) return;
  window.clearTimeout(state.sessionSaveTimer);
  const save = () => {
    const patch = {
      playback: {
        lastTick: Math.round(state.tick),
        followSteamId: state.followSteamId,
        speed: state.speed,
      },
      preferences: currentPreferences(),
    };
    Promise.resolve(bridge.saveSessionPatch(patch)).catch(() => {});
  };
  if (immediate) save();
  else state.sessionSaveTimer = window.setTimeout(save, 650);
}

/** @returns {ViewerBundle} */
function normalizeBundle(raw) {
  const source = raw?.viewer && typeof raw.viewer === 'object' ? raw.viewer : raw;
  if (!source || typeof source !== 'object') throw new Error('The parsed bundle is empty or malformed.');
  const meta = source.meta && typeof source.meta === 'object' ? { ...source.meta } : {};
  const version = String(meta.viewerVersion || meta.schemaVersion || '');
  if (version && version !== 'viewer-v1') throw new Error(`Unsupported viewer bundle version: ${version}`);
  meta.viewerVersion = 'viewer-v1';
  const tracks = source.tracks && typeof source.tracks === 'object' ? { ...source.tracks } : {};
  tracks.ticksByPlayer = tracks.ticksByPlayer && typeof tracks.ticksByPlayer === 'object' ? tracks.ticksByPlayer : {};
  for (const key of ['shots', 'impacts', 'hurts', 'blinds', 'kills', 'nades', 'utilityThrows', 'projectiles', 'bombs', 'doors', 'timeouts']) {
    tracks[key] = array(tracks[key]).slice().sort((a, b) => finite(a?.tick ?? a?.startTick) - finite(b?.tick ?? b?.startTick));
  }
  const players = array(source.players).map((player) => ({
    ...player,
    steamId: String(player?.steamId || player?.steamid || ''),
    name: String(player?.name || player?.playerName || player?.steamId || 'Unknown'),
  })).filter((player) => player.steamId);
  if (!players.length) {
    for (const [steamId, track] of Object.entries(tracks.ticksByPlayer)) {
      players.push({ steamId, name: String(track?.name || steamId) });
    }
  }
  const teams = array(source.teams).map((team) => ({ ...team }));
  const rounds = array(source.rounds).slice().sort((a, b) => finite(a?.startTick) - finite(b?.startTick));
  const fallbackBounds = { minX: -2000, maxX: 2000, minY: -2000, maxY: 2000 };
  const inputBounds = source.bounds && typeof source.bounds === 'object' ? source.bounds : fallbackBounds;
  const bounds = {
    minX: finite(inputBounds.minX, fallbackBounds.minX),
    maxX: finite(inputBounds.maxX, fallbackBounds.maxX),
    minY: finite(inputBounds.minY, fallbackBounds.minY),
    maxY: finite(inputBounds.maxY, fallbackBounds.maxY),
  };
  if (bounds.maxX <= bounds.minX) [bounds.minX, bounds.maxX] = [fallbackBounds.minX, fallbackBounds.maxX];
  if (bounds.maxY <= bounds.minY) [bounds.minY, bounds.maxY] = [fallbackBounds.minY, fallbackBounds.maxY];
  const normalized = { meta, bounds, players, teams, rounds, tracks };
  meta.tickRate = clamp(meta.tickRate || 64, 1, 256);
  meta.totalTicks = Math.max(1, finite(meta.totalTicks, maxTrackTick(normalized)));
  meta.durationSeconds = finite(meta.durationSeconds, meta.totalTicks / meta.tickRate);
  return normalized;
}

function validateDescriptor(value) {
  if (!value) return null;
  const descriptor = value.descriptor && typeof value.descriptor === 'object' ? value.descriptor : value;
  if (!descriptor || typeof descriptor !== 'object' || !String(descriptor.bundleUrl || '').trim()) {
    throw new Error('The main process returned an invalid demo descriptor.');
  }
  return {
    demo: descriptor.demo && typeof descriptor.demo === 'object' ? descriptor.demo : {},
    bundleUrl: String(descriptor.bundleUrl),
    fromCache: Boolean(descriptor.fromCache),
    sourceAvailable: descriptor.sourceAvailable !== false,
    warnings: array(descriptor.warnings).map(String),
    session: descriptor.session && typeof descriptor.session === 'object' ? descriptor.session : {},
    preferences: descriptor.preferences && typeof descriptor.preferences === 'object' ? descriptor.preferences : value.preferences,
  };
}

async function fetchBundle(bundleUrl) {
  const response = await fetch(bundleUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to read parsed bundle (${response.status}).`);
  return normalizeBundle(await response.json());
}

async function acceptDescriptor(rawDescriptor, origin) {
  const descriptor = validateDescriptor(rawDescriptor);
  if (!descriptor) return false;
  setLoading(true, { percent: 98, stage: 'Loading viewer', message: 'Reading the parsed demo bundle…' });
  const bundle = await fetchBundle(descriptor.bundleUrl);
  state.descriptor = descriptor;
  state.bundle = bundle;
  state.statsCache.clear();
  applyPreferences(descriptor.preferences || {});
  state.mapKey = normalizeMapKey(bundle.meta.mapName || descriptor.demo.mapName || '');
  state.mapLayout = sanitizeLayout(state.mapLayouts[state.mapKey], MAP_LAYOUT_DEFAULTS[state.mapKey] || EMPTY_LAYOUT);
  state.cameraPanX = 0;
  state.cameraPanY = 0;
  syncMapControls();
  await Promise.allSettled([loadMapArt(), loadAudioCatalog()]);
  rebuildBlindIndex();
  populateFollowSelect();
  renderRoundMarkers();
  const sessionSpeed = finite(descriptor.session?.playback?.speed ?? descriptor.session?.speed, 1);
  state.speed = SPEEDS.has(sessionSpeed) ? sessionSpeed : 1;
  if (dom.speedSelect instanceof HTMLSelectElement) dom.speedSelect.value = String(state.speed);
  const restoredFollow = String(descriptor.session?.playback?.followSteamId ?? descriptor.session?.followSteamId ?? '');
  state.followSteamId = bundle.players.some((row) => row.steamId === restoredFollow) ? restoredFollow : '';
  if (dom.followSelect instanceof HTMLSelectElement) dom.followSelect.value = state.followSteamId;
  setPlaying(false);
  setTick(clamp(descriptor.session?.playback?.lastTick ?? descriptor.session?.lastTick ?? 0, 0, bundle.meta.totalTicks), { reset: true, persist: false });
  updateDemoHeader();
  setControlsEnabled(true);
  if (dom.rebuildDemoBtn instanceof HTMLButtonElement) dom.rebuildDemoBtn.disabled = !descriptor.sourceAvailable;
  dom.emptyState?.classList.add('hidden');
  const warnings = [...descriptor.warnings, ...array(bundle.meta.warnings)];
  if (!descriptor.sourceAvailable) warnings.unshift('The source .dem file is missing. Playback is using the cached bundle; rebuild is unavailable.');
  showWarnings(warnings);
  const sourceLabel = descriptor.fromCache ? 'cached bundle' : 'new parse';
  setStatus(`${origin === 'restore' ? 'Restored' : 'Loaded'} ${descriptor.demo.title || 'demo'} from ${sourceLabel}.`, warnings.length ? 'neutral' : 'success');
  setLoading(false);
  return true;
}

async function runDescriptorAction(action, origin) {
  if (!bridge) {
    setStatus('The secure viewer bridge is unavailable.', 'error');
    return;
  }
  setLoading(true, { percent: 0, stage: origin === 'rebuild' ? 'Rebuilding demo' : 'Opening demo', message: 'Preparing parser…' });
  setStatus(origin === 'rebuild' ? 'Rebuilding parsed bundle…' : 'Opening demo…', 'working');
  try {
    const result = await action();
    if (!result) {
      setLoading(false);
      setStatus(state.bundle ? 'Open cancelled; the active demo is unchanged.' : 'Open cancelled.', 'neutral');
      return;
    }
    await acceptDescriptor(result, origin);
  } catch (error) {
    setLoading(false);
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`${origin === 'rebuild' ? 'Rebuild' : 'Load'} failed: ${message}`, 'error');
  }
}

function tickRate() { return clamp(state.bundle?.meta?.tickRate || 64, 1, 256); }
function totalTicks() { return Math.max(1, Math.round(finite(state.bundle?.meta?.totalTicks, 1))); }
function roundAtTick(tick = state.tick) {
  let found = null;
  for (const round of array(state.bundle?.rounds)) { if (finite(round.startTick) <= tick) found = round; else break; }
  return found;
}
function playerName(id) { return state.bundle?.players.find((row) => row.steamId === String(id))?.name || String(id || 'Unknown'); }
function rebuildPlayerState(tick = state.tickFloat) {
  state.lastPlayerState = state.playerState;
  const next = {};
  for (const [id, track] of Object.entries(state.bundle?.tracks?.ticksByPlayer || {})) {
    const row = samplePlayerTrack(track, tick);
    if (row) { row.steamId = id; row.name ||= playerName(id); next[id] = row; }
  }
  state.playerState = next;
}
function updateDemoHeader() {
  if (!state.bundle || !state.descriptor) return;
  const map = state.mapKey ? state.mapKey.replace(/^de_/, '').replace(/_/g, ' ') : 'unknown map';
  if (dom.demoTitle) dom.demoTitle.textContent = state.descriptor.demo.title || state.bundle.meta.title || 'CS2 demo';
  if (dom.demoSubtitle) dom.demoSubtitle.textContent = `${map} · ${state.descriptor.fromCache ? 'cached parse' : 'parsed locally'}`;
  if (dom.demoMeta) dom.demoMeta.innerHTML = [
    ['Map', map], ['Players', state.bundle.players.length], ['Tick rate', `${Math.round(tickRate())} Hz`],
    ['Duration', formatDuration(finite(state.bundle.meta.durationSeconds, totalTicks() / tickRate()))],
  ].map(([a, b]) => `<div><dt>${escapeHtml(a)}</dt><dd>${escapeHtml(b)}</dd></div>`).join('');
}
function populateFollowSelect() {
  if (!(dom.followSelect instanceof HTMLSelectElement) || !state.bundle) return;
  dom.followSelect.innerHTML = '<option value="">Free camera</option>' + state.bundle.players
    .map((row) => `<option value="${escapeHtml(row.steamId)}">${escapeHtml(row.name)}</option>`).join('');
}
function renderRoundMarkers() {
  if (!dom.roundMarkers || !state.bundle) return;
  const markerLines = state.bundle.rounds.map((round, index) => {
    const x = clamp(finite(round.startTick) / totalTicks() * 1000, 0, 1000);
    return `<line x1="${x}" x2="${x}" y1="0" y2="8"><title>Round ${escapeHtml(round.round || index + 1)}</title></line>`;
  }).join('');
  dom.roundMarkers.innerHTML = `<svg class="round-marker-svg" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true">${markerLines}</svg>`;
}
async function loadMapArt() {
  state.mapImage = null; state.nukeImages = { A: null, B: null };
  const nuke = state.mapKey === 'de_nuke';
  dom.nukeLayerToggle?.classList.toggle('hidden', !nuke);
  if (!AVAILABLE_MAPS.has(state.mapKey)) { if (dom.mapStatus) dom.mapStatus.textContent = 'Map unavailable; using coordinate grid.'; return; }
  try {
    if (nuke) {
      const [a, b] = await Promise.all([loadImage(assetUrl('maps', 'de_nuke_A.png')), loadImage(assetUrl('maps', 'de_nuke_B.png'))]);
      state.nukeImages = { A: /** @type {HTMLImageElement} */ (a), B: /** @type {HTMLImageElement} */ (b) };
      state.mapImage = state.nukeImages[state.nukeLayer];
    } else state.mapImage = /** @type {HTMLImageElement} */ (await loadImage(assetUrl('maps', `${state.mapKey}.png`)));
    if (dom.mapStatus) dom.mapStatus.textContent = 'Calibrated map art loaded.';
  } catch (_error) { if (dom.mapStatus) dom.mapStatus.textContent = 'Map art failed; using coordinate grid.'; }
}

async function loadAudioCatalog() {
  if (!bridge?.getAudioCatalog || state.audioCatalog) return;
  try { state.audioCatalog = await bridge.getAudioCatalog(); state.audioConfig = { ...DEFAULT_AUDIO_CONFIG, ...(state.audioCatalog?.config || {}) }; }
  catch (_error) { state.audioCatalog = null; }
}
function rebuildBlindIndex() {
  state.blindByPlayer = {};
  for (const row of array(state.bundle?.tracks?.blinds)) {
    const id = String(row.victimSteamId || '');
    if (id) (state.blindByPlayer[id] ||= []).push({ tick: finite(row.tick), endTick: finite(row.endTick, finite(row.tick) + tickRate()) });
  }
}
function roundIndexAtTick(tick = state.tick) {
  return findRoundIndexAtTick(state.bundle, tick);
}
function setPlaying(value) {
  state.playing = Boolean(value && state.bundle && !state.statsOpen);
  if (dom.playPauseGlyph) dom.playPauseGlyph.textContent = state.playing ? '❚❚' : '▶';
  if (dom.playPauseText) dom.playPauseText.textContent = state.playing ? 'Pause' : 'Play';
  if (state.playing) ensureAudioContext();
}
function resetTransientState(cursors = null) {
  state.audioGeneration += 1; stopActiveAudio();
  state.damageFlashEnds = {}; state.bombAudio = null; stopMolotovAudio();
  state.audioCursors = cursors || resetEventCursors(state.bundle, state.tick);
}
function setTick(value, options = {}) {
  if (!state.bundle) return;
  if (options.reset && !state.timelineScrubbing) state.audioSuppressedUntilMs = performance.now() + 250;
  const previous = state.tick;
  const seek = resolveSeek(state.bundle, previous, value, { forceReset: Boolean(options.reset), resetThresholdTicks: tickRate() * 2 });
  state.tickFloat = seek.tickFloat; state.tick = seek.tick;
  if (seek.reset) resetTransientState(seek.cursors);
  rebuildPlayerState();
  if (!options.reset && state.tick >= previous) processAudioEvents(previous, state.tick);
  updatePlaybackUi(); renderHud();
  if (options.persist !== false) scheduleSessionSave();
}
function beginTimelineScrub() {
  if (!state.bundle || state.timelineScrubbing) return;
  state.timelineScrubbing = true; state.audioSuppressedUntilMs = Infinity; resetTransientState();
}
function endTimelineScrub() {
  if (!state.timelineScrubbing) return;
  state.timelineScrubbing = false; state.audioSuppressedUntilMs = performance.now() + 250;
  state.audioCursors = resetEventCursors(state.bundle, state.tick); state.bombAudio = null;
}
function updatePlaybackUi() {
  if (!state.bundle) return;
  if (dom.timelineInput instanceof HTMLInputElement) { dom.timelineInput.max = String(totalTicks()); dom.timelineInput.value = String(state.tick); }
  if (dom.tickInput instanceof HTMLInputElement) { dom.tickInput.max = String(totalTicks()); dom.tickInput.value = String(state.tick); }
  if (dom.timeLabel) dom.timeLabel.textContent = `${formatDuration(state.tick / tickRate())} / ${formatDuration(totalTicks() / tickRate())}`;
  const index = roundIndexAtTick();
  if (dom.roundLabel) dom.roundLabel.textContent = index >= 0 ? `Round ${state.bundle.rounds[index]?.round || index + 1}` : 'Pre-match';
}
function jumpRound(direction) {
  const target = jumpRoundTick(state.bundle, state.tick, direction); if (target == null) return;
  setTick(target, { reset: true });
}
function statsAt(tick, exact = false) {
  if (!state.bundle) return null;
  const q = exact ? 1 : Math.max(1, Math.round(tickRate() / 4));
  const key = String(clamp(Math.round(tick / q) * q, 0, totalTicks()));
  if (!state.statsCache.has(key)) {
    state.statsCache.set(key, computeMatchStats(state.bundle, Number(key)));
    if (state.statsCache.size > 40) state.statsCache.delete(state.statsCache.keys().next().value);
  }
  return state.statsCache.get(key);
}
function activeBomb(tick = state.tick) {
  return activeBombAtTick(state.bundle, tick);
}
function renderHud() {
  if (!state.bundle) return;
  const round = roundAtTick(); const stats = statsAt(state.tick); const bomb = activeBomb(); let seconds = 0;
  if (bomb) {
    seconds = Math.max(0, CLOCK_DEFAULTS.bombTimeSec - (state.tick - finite(bomb.tick)) / tickRate());
    if (state.playing && !audioPlaybackBlocked()) {
      const plantTick = finite(bomb.tick);
      if (!state.bombAudio || state.bombAudio.endTick !== plantTick) {
        state.bombAudio = { endTick: plantTick, roundEndTick: finite(round?.endTick, totalTicks()), nextBeepTick: state.tick, x: finite(bomb.x), y: finite(bomb.y), site: String(bomb.site).toUpperCase() === 'B' ? 'B' : 'A' };
      }
      if (state.tick >= state.bombAudio.nextBeepTick) {
        const urgent = seconds <= 10;
        playGroup(state.bombAudio.site === 'B' ? (urgent ? 'bombBeepBTen' : 'bombBeepB') : (urgent ? 'bombBeepATen' : 'bombBeepA'), state.bombAudio);
        state.bombAudio.nextBeepTick = state.tick + tickRate() * (urgent ? .48 : .92);
      }
    }
  } else if (round) {
    const live = finite(round.freezeEndTick, finite(round.startTick));
    seconds = state.tick < live ? (live - state.tick) / tickRate() : Math.max(0, CLOCK_DEFAULTS.roundTimeSec - (state.tick - live) / tickRate());
  }
  if (dom.clockLabel) dom.clockLabel.textContent = `${bomb ? 'BOMB ' : ''}${formatDuration(seconds)}`;
  if (dom.matchScoreLabel) dom.matchScoreLabel.textContent = array(stats?.teams).map((team) => `${team.name} ${team.score}`).join('  ·  ');
  renderTeamCards(stats); renderKillFeed();
  if (state.scoreboardOpen) renderScoreboard(stats);
}

function weaponIcon(name, primary = false) {
  const normalized = String(name || '').toLowerCase();
  if (!normalized) return '';
  return `<span class="weapon-icon${primary ? ' primary' : ''}">${weaponSvg(normalized)}</span>`;
}
function renderTeamCards(stats) {
  if (!dom.teamCards) return;
  dom.teamCards.classList.toggle('hidden', !state.showTeamCards || !state.bundle);
  if (!state.showTeamCards || !stats) return;
  dom.teamCards.innerHTML = array(stats.teams).slice(0, 2).map((team) => {
    const rows = array(team.players).map((player) => {
      const live = state.playerState[player.steamId] || {};
      const gear = live.inventory?.find((item) => PRIMARY_WEAPONS.has(String(item).toLowerCase())) || live.weapon;
      return `<div class="team-card-row${live.isAlive === false ? ' is-dead' : ''}"><div class="team-card-main"><div class="team-card-name">${escapeHtml(player.name)}</div><div class="team-card-vitals"><span>${live.health ?? 0} HP</span><span>${live.armor ?? 0} ARM</span><span>$${finite(live.money).toLocaleString()}</span></div></div><div class="team-card-gear">${weaponIcon(gear, true)}</div><span class="team-card-health-track"><progress class="team-card-health-fill" max="100" value="${clamp(live.health, 0, 100)}"></progress></span></div>`;
    }).join('');
    return `<button class="team-card" type="button" data-team-id="${escapeHtml(team.id)}" data-side="${escapeHtml(team.side)}"><span class="team-card-header"><span>${escapeHtml(team.name)}</span><span class="team-card-score">${finite(team.score)}</span></span><span class="team-card-body">${rows}</span></button>`;
  }).join('');
}
function renderKillFeed() {
  if (!dom.killFeed || !state.bundle) return;
  const rows = array(state.bundle.tracks.kills).filter((row) => state.tick - finite(row.tick) >= 0 && state.tick - finite(row.tick) < tickRate() * 6).slice(-6);
  dom.killFeed.innerHTML = rows.map((row) => `<div class="kill-feed-entry"><span class="kill-feed-name" data-side="${normalizeSide(row.killerTeam)}">${escapeHtml(row.killerName || playerName(row.killerSteamId))}</span><span class="kill-feed-weapon">${escapeHtml(row.weapon || 'kill')}</span>${row.headshot ? '<span class="kill-feed-extra">HS</span>' : ''}<span class="kill-feed-name" data-side="${normalizeSide(row.victimTeam)}">${escapeHtml(row.victimName || playerName(row.victimSteamId))}</span></div>`).join('');
}
function renderScoreboard(stats = statsAt(state.tick, true)) {
  if (!dom.scoreboard || !stats) return;
  dom.scoreboard.innerHTML = `<table><thead><tr><th>Player</th><th>K</th><th>D</th><th>A</th><th>ADR</th><th>HS%</th><th>HP</th><th>Money</th><th>Gear</th></tr></thead><tbody>${array(stats.teams).map((team) => `<tr class="scoreboard-team-row" data-side="${team.side}"><th colspan="9">${escapeHtml(team.name)} · ${finite(team.score)}</th></tr>${array(team.players).map((row) => { const live = state.playerState[row.steamId] || {}; return `<tr class="scoreboard-player-row${live.isAlive === false ? ' is-dead' : ''}"><td class="scoreboard-player-name">${escapeHtml(row.name)}</td><td>${finite(row.kills)}</td><td>${finite(row.deaths)}</td><td>${finite(row.assists)}</td><td>${finite(row.adr).toFixed(1)}</td><td>${finite(row.headshotPercent ?? row.hsPercent).toFixed(0)}</td><td class="scoreboard-health">${live.health ?? 0}</td><td>$${finite(live.money).toLocaleString()}</td><td><span class="scoreboard-gear">${weaponIcon(live.weapon, true)}</span></td></tr>`; }).join('')}`).join('')}</tbody></table>`;
}
function setScoreboard(open) {
  state.scoreboardOpen = Boolean(open && state.bundle && !state.statsOpen);
  dom.scoreboard?.classList.toggle('hidden', !state.scoreboardOpen);
  if (state.scoreboardOpen) renderScoreboard();
}

const STAT_COLUMNS = {
  general: [['kills', 'K'], ['deaths', 'D'], ['assists', 'A'], ['flashAssists', 'FA'], ['adr', 'ADR'], ['kast', 'KAST%'], ['headshotPercent', 'HS%'], ['bombsPlanted', 'Plants'], ['bombsDefused', 'Defuses']],
  performance: [['accuracy', 'Accuracy%'], ['shotsFired', 'Shots'], ['shotsHit', 'Hits'], ['totalDamage', 'Damage'], ['damageReceived', 'Taken'], ['assistDamage', 'Assist dmg'], ['roundsSurvivedCount', 'Survived']],
  utility: [['heDamage', 'HE dmg'], ['molotovDamage', 'Fire dmg'], ['enemiesFlashed', 'Flashed'], ['utility.totalBlindSeconds', 'Blind sec'], ['utility.utilityKills', 'Util K'], ['utility.utilityDamageTotal', 'Util dmg'], ['utility.totalUnusedUtilityValue', 'Unused $']],
};
function nestedValue(row, path) { return String(path).split('.').reduce((value, key) => value?.[key], row); }
function formatStat(value, label) {
  const n = finite(value); if (label.includes('%') || label === 'ADR' || label === 'Blind sec') return n.toFixed(1); return Math.round(n).toLocaleString();
}
function renderStatsOverlay() {
  if (!state.statsOpen || !state.bundle || !dom.statsContent) return;
  const tick = state.statsScope === 'full' ? totalTicks() : state.tick;
  const stats = statsAt(tick, true); if (!stats) return;
  const columns = STAT_COLUMNS[state.statsCategory];
  const focusTeam = array(stats.teams).find((team) => team.id === state.statsFocusTeamId);
  if (dom.statsTitle) dom.statsTitle.textContent = focusTeam ? `${focusTeam.name} statistics` : 'Match statistics';
  if (dom.statsMeta) dom.statsMeta.textContent = `${state.statsScope === 'full' ? 'Full match' : `Through tick ${state.tick.toLocaleString()}`} · ${stats.roundsCompleted} completed rounds`;
  dom.statsContent.innerHTML = array(stats.teams).map((team) => `<section class="stats-team-block"><div class="stats-team-heading" data-side="${team.side}"><strong>${escapeHtml(team.name)}</strong><span>${finite(team.score)} rounds · ${team.side}</span></div><div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Player</th>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${array(team.players).map((row) => `<tr${team.id === state.statsFocusTeamId ? ' class="is-focus-row"' : ''}><td>${escapeHtml(row.name)}</td>${columns.map(([key, label]) => `<td>${formatStat(nestedValue(row, key), label)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('') || '<div class="stats-empty">No statistics are available.</div>';
}
function openStats(focusTeamId = '') {
  if (!state.bundle || state.statsOpen) return;
  state.statsResume = state.playing; setPlaying(false); state.statsOpen = true; state.statsFocusTeamId = String(focusTeamId || '');
  dom.statsOverlay?.classList.remove('hidden'); renderStatsOverlay(); if (dom.closeStatsBtn instanceof HTMLButtonElement) dom.closeStatsBtn.focus();
}
function closeStats() {
  if (!state.statsOpen) return;
  state.statsOpen = false; dom.statsOverlay?.classList.add('hidden');
  if (state.statsResume) setPlaying(true); state.statsResume = false;
}

function canvasMetrics() {
  const canvas = dom.viewerCanvas;
  if (!(canvas instanceof HTMLCanvasElement) || !state.bundle) return null;
  const width = canvas.clientWidth || 1, height = canvas.clientHeight || 1;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Use the fixed CS2 overview rectangle when map metadata exists. Player-derived
  // bounds only describe where this particular match happened, not the map itself.
  const bounds = MAP_OVERVIEWS[state.mapKey] || state.bundle.bounds;
  const rangeX = Math.max(1, bounds.maxX - bounds.minX), rangeY = Math.max(1, bounds.maxY - bounds.minY);
  const worldScale = Math.min(width / (rangeX / state.mapLayout.zoom), height / (rangeY / state.mapLayout.zoom));
  let panX = state.cameraPanX, panY = state.cameraPanY;
  const centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
  const base = (x, y) => ({ x: width / 2 + (x - centerX) * worldScale, y: height / 2 - (y - centerY) * worldScale });
  const followed = state.playerState[state.followSteamId];
  if (followed) { const point = base(followed.x, followed.y); panX += width / 2 - point.x; panY += height / 2 - point.y; }
  return { ctx, width, height, bounds, rangeX, rangeY, worldScale, world: (x, y) => { const p = base(x, y); return { x: p.x + panX, y: p.y + panY }; }, radius: (world) => world * worldScale };
}
function drawGrid(m) {
  const { ctx, width, height } = m; ctx.fillStyle = '#0b1119'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = 'rgba(98,126,153,.16)'; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
}
function drawMap(m) {
  drawGrid(m);
  const image = state.mapKey === 'de_nuke' ? state.nukeImages[state.nukeLayer] : state.mapImage;
  if (!image) return;
  // Layout values calibrate the map image in demo world space. Player samples
  // intentionally remain on the unscaled world transform used by the source viewer.
  const imageAspect = Math.max(.0001, image.width / Math.max(1, image.height));
  const scaledX = m.rangeX * state.mapLayout.scale, scaledY = m.rangeY * state.mapLayout.scale;
  const boxAspect = Math.max(.0001, scaledX / scaledY);
  let drawSpanX = scaledX, drawSpanY = scaledY;
  if (imageAspect > boxAspect) drawSpanY = scaledX / imageAspect;
  else if (imageAspect < boxAspect) drawSpanX = scaledY * imageAspect;
  const centerX = (m.bounds.minX + m.bounds.maxX) / 2 + state.mapLayout.panX * m.rangeX;
  const centerY = (m.bounds.minY + m.bounds.maxY) / 2 + state.mapLayout.panY * m.rangeY;
  const topLeft = m.world(centerX - drawSpanX / 2, centerY + drawSpanY / 2);
  const bottomRight = m.world(centerX + drawSpanX / 2, centerY - drawSpanY / 2);
  const x = Math.min(topLeft.x, bottomRight.x), y = Math.min(topLeft.y, bottomRight.y);
  const width = Math.abs(bottomRight.x - topLeft.x), height = Math.abs(bottomRight.y - topLeft.y);
  if (width <= 1 || height <= 1) return;
  m.ctx.save(); m.ctx.globalAlpha = .92; m.ctx.drawImage(image, x, y, width, height); m.ctx.restore();
}
function drawTrails(m) {
  if (!state.showTrails) return;
  for (const [id, track] of Object.entries(state.bundle?.tracks?.ticksByPlayer || {})) {
    const ticks = array(track.tick); const end = floorIndex(ticks, state.tick); if (end < 1) continue;
    const start = Math.max(0, end - 20); m.ctx.beginPath();
    for (let index = start; index <= end; index += 1) { const p = m.world(finite(track.x[index]), finite(track.y[index])); if (index === start) m.ctx.moveTo(p.x, p.y); else m.ctx.lineTo(p.x, p.y); }
    m.ctx.strokeStyle = state.playerState[id]?.side === 'T' ? 'rgba(232,165,88,.3)' : 'rgba(116,174,233,.3)'; m.ctx.lineWidth = 1.5; m.ctx.stroke();
  }
}
function drawShots(m) {
  if (!state.showShots) return;
  for (const row of array(state.bundle?.tracks?.shots)) {
    const age = state.tick - finite(row.tick); if (age < 0 || age > 12) continue;
    const shooter = samplePlayerTrack(state.bundle?.tracks?.ticksByPlayer?.[String(row.shooterSteamId || '')], finite(row.tick));
    const side = shooter?.side || normalizeSide(row.shooterTeam || row.team);
    const rgb = side === 'T' ? '232,165,88' : side === 'CT' ? '116,174,233' : '255,225,158';
    const a = m.world(finite(row.x), finite(row.y)); const b = m.world(finite(row.endX, row.x), finite(row.endY, row.y));
    m.ctx.beginPath(); m.ctx.moveTo(a.x, a.y); m.ctx.lineTo(b.x, b.y); m.ctx.strokeStyle = 'rgba(' + rgb + ',' + (1 - age / 12) + ')'; m.ctx.lineWidth = row.didDamage ? 2 : 1; m.ctx.stroke();
  }
}
function projectilePoint(row) {
  const points = array(row.points); if (!points.length) return null;
  const index = floorIndex(points.map((p) => finite(p.tick)), state.tick); if (index < 0) return points[0];
  const a = points[index], b = points[Math.min(index + 1, points.length - 1)]; const span = finite(b.tick) - finite(a.tick); const mix = span > 0 ? clamp((state.tick - finite(a.tick)) / span, 0, 1) : 0;
  return { x: finite(a.x) + (finite(b.x) - finite(a.x)) * mix, y: finite(a.y) + (finite(b.y) - finite(a.y)) * mix };
}
function drawUtility(m) {
  if (!state.showNades) return;
  for (const row of array(state.bundle?.tracks?.nades)) {
    if (state.tick < finite(row.tick) || state.tick > finite(row.endTick, row.tick + 16)) continue;
    const p = m.world(finite(row.x), finite(row.y)); const radius = Math.max(8, m.radius(finite(row.radius, 100))); const type = String(row.type);
    const inner = type === 'inferno' ? '#f06e42' : type === 'smoke' ? '#9bb2c2' : type === 'flash' ? '#fff8cf' : '#ec8871';
    const outer = type === 'inferno' ? 'rgba(235,81,45,.08)' : type === 'smoke' ? 'rgba(157,180,194,.10)' : type === 'flash' ? 'rgba(255,248,207,.08)' : 'rgba(236,136,113,.08)';
    const gradient = m.ctx.createRadialGradient(p.x, p.y, Math.max(1, radius * .12), p.x, p.y, radius); gradient.addColorStop(0, inner + 'b8'); gradient.addColorStop(.55, inner + '54'); gradient.addColorStop(1, outer);
    m.ctx.beginPath(); m.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); m.ctx.fillStyle = gradient; m.ctx.fill(); m.ctx.strokeStyle = inner + '70'; m.ctx.lineWidth = 1; m.ctx.stroke();
    if (type === 'inferno') { m.ctx.beginPath(); for (let i = 0; i < 8; i += 1) { const angle = i * Math.PI / 4; m.ctx.moveTo(p.x + Math.cos(angle) * radius * .26, p.y + Math.sin(angle) * radius * .26); m.ctx.lineTo(p.x + Math.cos(angle) * radius * .72, p.y + Math.sin(angle) * radius * .72); } m.ctx.strokeStyle = 'rgba(255,202,110,.55)'; m.ctx.stroke(); }
  }
  for (const row of array(state.bundle?.tracks?.projectiles)) {
    if (state.tick < finite(row.startTick) || state.tick > finite(row.endTick)) continue;
    const point = projectilePoint(row); if (!point) continue; const p = m.world(point.x, point.y);
    m.ctx.beginPath(); m.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); m.ctx.fillStyle = '#e8b260'; m.ctx.fill();
  }
}
function drawActiveBomb(m) {
  const bomb = activeBomb(); if (!bomb) return;
  const point = m.world(finite(bomb.x), finite(bomb.y)); const pulse = 9 + (Math.sin(state.tick / Math.max(1, tickRate()) * Math.PI * 3) + 1) * 2;
  m.ctx.save();
  m.ctx.beginPath(); m.ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2); m.ctx.fillStyle = 'rgba(238, 89, 74, .2)'; m.ctx.fill();
  m.ctx.beginPath(); m.ctx.arc(point.x, point.y, 10, 0, Math.PI * 2); m.ctx.fillStyle = 'rgba(8, 16, 26, .88)'; m.ctx.fill(); m.ctx.strokeStyle = '#ef7777'; m.ctx.lineWidth = 1.5; m.ctx.stroke();
  drawWeaponGlyph(m.ctx, 'c4', point.x - 12, point.y - 8, 24, 16);
  m.ctx.restore();
}function drawPlayers(m) {
  for (const row of Object.values(state.playerState)) {
    const p = m.world(row.x, row.y); const color = row.side === 'T' ? '#e8a558' : row.side === 'CT' ? '#74aee9' : '#9ba8b7';
    m.ctx.save(); m.ctx.globalAlpha = row.isAlive ? 1 : .3; m.ctx.translate(p.x, p.y); m.ctx.rotate(-finite(row.yaw) * Math.PI / 180);
    m.ctx.beginPath(); m.ctx.moveTo(10, 0); m.ctx.lineTo(-7, -6); m.ctx.lineTo(-4, 0); m.ctx.lineTo(-7, 6); m.ctx.closePath(); m.ctx.fillStyle = color; m.ctx.fill(); m.ctx.strokeStyle = '#08101a'; m.ctx.lineWidth = 2; m.ctx.stroke(); m.ctx.restore();
    if (state.damageFlashEnds[row.steamId] > state.tick) { m.ctx.beginPath(); m.ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); m.ctx.strokeStyle = '#ef7777'; m.ctx.lineWidth = 2; m.ctx.stroke(); }
    if (state.showLabels) {
      const health = clamp(finite(row.health), 0, 100);
      m.ctx.fillStyle = 'rgba(5, 10, 16, .86)'; m.ctx.fillRect(p.x - 13, p.y - 28, 26, 4);
      m.ctx.fillStyle = health > 50 ? '#75d69a' : health > 25 ? '#e8b260' : '#ef7777'; m.ctx.fillRect(p.x - 12, p.y - 27, 24 * health / 100, 2);
      m.ctx.font = '10px ui-monospace, monospace'; m.ctx.textAlign = 'center'; m.ctx.fillStyle = '#eef4fa'; m.ctx.fillText(row.name, p.x, p.y - 14);
    }
    if (state.showWeapons) { m.ctx.save(); m.ctx.globalAlpha = row.isAlive ? 1 : .3; drawWeaponGlyph(m.ctx, row.weapon, p.x - 13, p.y + 14, 26, 16); m.ctx.restore(); }
  }
}
function drawBlind(m) {
  const windows = state.blindByPlayer[state.followSteamId] || []; const active = windows.find((row) => state.tick >= row.tick && state.tick <= row.endTick); if (!active) return;
  const strength = clamp((active.endTick - state.tick) / Math.max(1, active.endTick - active.tick), 0, 1);
  m.ctx.fillStyle = `rgba(255,255,245,${strength * .8})`; m.ctx.fillRect(0, 0, m.width, m.height);
}
function renderCanvas() {
  const m = canvasMetrics(); if (!m) return;
  drawMap(m); drawTrails(m); drawShots(m); drawUtility(m); drawActiveBomb(m); drawPlayers(m); drawBlind(m);
}

function ensureAudioContext() {
  if (!state.audioContext) {
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) return null;
    state.audioContext = new AudioCtor(); state.audioMaster = state.audioContext.createGain(); state.audioMaster.connect(state.audioContext.destination); updateAudioMasterGain();
  }
  if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
  return state.audioContext;
}
function updateAudioMasterGain() { if (state.audioMaster) state.audioMaster.gain.value = state.audioMuted ? 0 : state.audioVolume * finite(state.audioConfig?.master, 1); }
async function audioBuffer(url) {
  if (!url) return null; if (state.audioBuffers.has(url)) return state.audioBuffers.get(url);
  state.audioBuffers.set(url, null);
  try { const response = await fetch(url); const bytes = await response.arrayBuffer(); const context = ensureAudioContext(); const buffer = context ? await context.decodeAudioData(bytes) : null; state.audioBuffers.set(url, buffer); return buffer; }
  catch (_error) { return null; }
}
function audioPlaybackBlocked() { return state.timelineScrubbing || performance.now() < state.audioSuppressedUntilMs; }
function audioPanForWorldPosition(origin) {
  if (!origin || !Number.isFinite(Number(origin.x))) return 0;
  const metrics = canvasMetrics(); if (!metrics) return 0;
  const point = metrics.world(finite(origin.x), finite(origin.y));
  return clamp((point.x - metrics.width / 2) / Math.max(1, metrics.width / 2), -1, 1);
}
function proceduralSound(cue, gain = 1, origin = null) {
  if (state.audioMuted || audioPlaybackBlocked()) return null;
  const context = ensureAudioContext(); if (!context || !state.audioMaster) return null;
  const name = String(cue || '').replace(/^procedural:/, ''); const now = context.currentTime;
  const osc = context.createOscillator(), node = context.createGain(), panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  const tones = { 'weapon-heavy': [92, .18], 'weapon-shotgun': [118, .14], 'weapon-rifle': [168, .075], 'weapon-pistol': [250, .05], bombBeepA: [760, .055], bombBeepATen: [1040, .04], bombBeepB: [680, .055], bombBeepBTen: [980, .04], c4Initiate: [310, .12], c4PlantFinish: [420, .16], c4DefuseStart: [360, .12], c4DefuseFinish: [540, .16], c4Explode: [70, .38], flashExplode: [1250, .06], smoke: [190, .16], molotov: [230, .14], molotovExtinguish: [145, .12], heExplode: [82, .24], damageKevlar: [380, .035], damageBurn: [290, .05], damageHeadshot: [620, .035], doorOpen: [150, .12], ctWin: [520, .22], terWin: [360, .22] };
  const pair = tones[name] || [220, .08]; const frequency = pair[0]; const duration = pair[1];
  osc.type = name.includes('weapon') || name.includes('Explode') ? 'sawtooth' : name.includes('Win') ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * (name.includes('weapon') || name.includes('Explode') ? .38 : .88)), now + duration);
  node.gain.setValueAtTime(0.0001, now); node.gain.exponentialRampToValueAtTime(clamp(gain, .001, 1.2), now + .006); node.gain.exponentialRampToValueAtTime(.0001, now + duration);
  if (panner) { panner.pan.value = audioPanForWorldPosition(origin); osc.connect(panner); panner.connect(node); } else osc.connect(node);
  node.connect(state.audioMaster); state.activeAudioSources.add(osc); osc.addEventListener('ended', () => state.activeAudioSources.delete(osc), { once: true }); osc.start(now); osc.stop(now + duration + .02); return osc;
}
async function playAudio(url, gain = 1, origin = null) {
  if (String(url || '').startsWith('procedural:')) return proceduralSound(url, gain, origin);
  if (state.audioMuted || !url || audioPlaybackBlocked()) return null;
  const generation = state.audioGeneration; const context = ensureAudioContext(); const buffer = await audioBuffer(url);
  if (!context || !buffer || !state.audioMaster || generation !== state.audioGeneration || audioPlaybackBlocked()) return null;
  const source = context.createBufferSource(), node = context.createGain(), panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  node.gain.value = clamp(gain, 0, 2); source.buffer = buffer;
  if (panner) { panner.pan.value = audioPanForWorldPosition(origin); source.connect(panner); panner.connect(node); } else source.connect(node);
  node.connect(state.audioMaster);
  state.activeAudioSources.add(source); source.addEventListener('ended', () => state.activeAudioSources.delete(source), { once: true }); source.start(); return source;
}
function groupGain(group) { return finite(state.audioConfig?.groups?.[group], .5); }
function chooseAudio(rows, key) { const list = array(rows); if (!list.length) return ''; const index = state.audioRoundRobin[key] || 0; state.audioRoundRobin[key] = index + 1; return list[index % list.length]; }
function stopActiveAudio() { for (const source of state.activeAudioSources) { try { source.stop(); } catch { /* A source may have ended before a seek. */ } } state.activeAudioSources.clear(); }
function stopMolotovAudio() { for (const source of state.activeMolotovSources) { try { source.stop(); } catch { /* A source may already have ended during a seek. */ } } state.activeMolotovSources = []; }
function playGroup(group, origin = null) { return playAudio(chooseAudio(state.audioCatalog?.groups?.[group], group), groupGain(group), origin); }
function processRows(key, rows, endTick, callback, eventTick = (row) => finite(row.tick)) {
  let cursor = state.audioCursors[key] || 0;
  while (cursor < rows.length && eventTick(rows[cursor]) <= endTick) { callback(rows[cursor]); cursor += 1; }
  state.audioCursors[key] = cursor;
}
function processAudioEvents(_fromTick, toTick) {
  if (!state.playing || !state.audioCatalog) return;
  if (audioPlaybackBlocked()) { state.audioCursors = resetEventCursors(state.bundle, toTick); return; }
  const tracks = state.bundle?.tracks || {};
  processRows('shots', array(tracks.shots), toTick, (row) => playAudio(chooseAudio(state.audioCatalog.weapons?.[String(row.weapon).toLowerCase()], `w:${row.weapon}`), groupGain('weapons'), row));
  processRows('nades', array(tracks.nades), toTick, (row) => { const type = String(row.type); if (type === 'flash') playGroup('flashExplode', row); else if (type === 'he') playGroup('heExplode', row); else if (type === 'smoke') playGroup('smoke', row); else if (type === 'inferno') playGroup('molotov', row); else if (type === 'inferno_extinguish') playGroup('molotovExtinguish', row); });
  processRows('bombs', array(tracks.bombs), toTick, (row) => { const type = String(row.type); if (type === 'plant_start') playGroup('c4Initiate', row); else if (type === 'planted') playGroup('c4PlantFinish', row); else if (type === 'defuse_start') playGroup('c4DefuseStart', row); else if (type === 'defused') playGroup('c4DefuseFinish', row); else if (type === 'exploded') playGroup('c4Explode', row); });
  processRows('hurts', array(tracks.hurts), toTick, (row) => { state.damageFlashEnds[String(row.victimSteamId)] = finite(row.tick) + PLAYER_DAMAGE_FLASH_TICKS; const now = performance.now(); if (now - state.audioLastDamageMs > finite(state.audioConfig?.damageCooldownMs, 500)) { state.audioLastDamageMs = now; playGroup(row.headshot ? 'damageHeadshot' : String(row.weapon).includes('molotov') ? 'damageBurn' : 'damageKevlar', row); } });
  processRows('doors', array(tracks.doors), toTick, () => { const now = performance.now(); if (now - state.audioLastDoorMs > 300) { state.audioLastDoorMs = now; playGroup('doorOpen'); } });
  processRows('rounds', array(state.bundle?.rounds), toTick, (row) => playGroup(normalizeSide(row.winner) === 'CT' ? 'ctWin' : 'terWin'), (row) => finite(row.endTick));
}

function applyLayoutInputs() {
  state.mapLayout = sanitizeLayout({
    scale: dom.mapScaleInput instanceof HTMLInputElement ? dom.mapScaleInput.value : state.mapLayout.scale,
    panX: dom.mapPanXInput instanceof HTMLInputElement ? dom.mapPanXInput.value : state.mapLayout.panX,
    panY: dom.mapPanYInput instanceof HTMLInputElement ? dom.mapPanYInput.value : state.mapLayout.panY,
    zoom: dom.mapZoomInput instanceof HTMLInputElement ? dom.mapZoomInput.value : state.mapLayout.zoom,
  }, state.mapLayout);
  syncMapControls();
}
function bindUi() {
  dom.openDemoBtn?.addEventListener('click', () => runDescriptorAction(() => bridge.openDemo(), 'open'));
  dom.emptyOpenBtn?.addEventListener('click', () => runDescriptorAction(() => bridge.openDemo(), 'open'));
  dom.rebuildDemoBtn?.addEventListener('click', () => runDescriptorAction(() => bridge.rebuildActiveDemo(), 'rebuild'));
  dom.cancelParseBtn?.addEventListener('click', async () => { await bridge?.cancelParse?.(); setLoading(false); setStatus('Parse cancelled; the active demo is unchanged.', 'neutral'); });
  dom.playPauseBtn?.addEventListener('click', () => setPlaying(!state.playing)); dom.prevRoundBtn?.addEventListener('click', () => jumpRound(-1)); dom.nextRoundBtn?.addEventListener('click', () => jumpRound(1));
  dom.speedSelect?.addEventListener('change', () => { const speed = dom.speedSelect instanceof HTMLSelectElement ? finite(dom.speedSelect.value, 1) : 1; state.speed = SPEEDS.has(speed) ? speed : 1; scheduleSessionSave(); });
  dom.followSelect?.addEventListener('change', () => { state.followSteamId = dom.followSelect instanceof HTMLSelectElement ? dom.followSelect.value : ''; state.cameraPanX = 0; state.cameraPanY = 0; scheduleSessionSave(); });
  dom.timelineInput?.addEventListener('pointerdown', beginTimelineScrub);
  dom.timelineInput?.addEventListener('pointerup', endTimelineScrub);
  dom.timelineInput?.addEventListener('pointercancel', endTimelineScrub);
  dom.timelineInput?.addEventListener('change', endTimelineScrub);
  window.addEventListener('pointerup', endTimelineScrub);
  dom.timelineInput?.addEventListener('input', () => { if (dom.timelineInput instanceof HTMLInputElement) setTick(finite(dom.timelineInput.value), { reset: true }); });
  dom.tickInput?.addEventListener('change', () => { if (dom.tickInput instanceof HTMLInputElement) setTick(finite(dom.tickInput.value), { reset: true }); });
  const bindToggle = (element, setter) => element?.addEventListener('change', () => { if (element instanceof HTMLInputElement) setter(element.checked); renderHud(); scheduleSessionSave(); });
  bindToggle(dom.showLabelsToggle, (value) => { state.showLabels = value; });
  bindToggle(dom.showTrailsToggle, (value) => { state.showTrails = value; });
  bindToggle(dom.showShotsToggle, (value) => { state.showShots = value; });
  bindToggle(dom.showNadesToggle, (value) => { state.showNades = value; });
  bindToggle(dom.showTeamCardsToggle, (value) => { state.showTeamCards = value; });
  dom.audioMuteBtn?.addEventListener('click', () => { state.audioMuted = !state.audioMuted; syncPreferenceControls(); scheduleSessionSave(); });
  dom.audioVolumeInput?.addEventListener('input', () => { if (dom.audioVolumeInput instanceof HTMLInputElement) state.audioVolume = clamp(dom.audioVolumeInput.value, 0, 1); syncPreferenceControls(); scheduleSessionSave(); });
  for (const input of [dom.mapScaleInput, dom.mapPanXInput, dom.mapPanYInput, dom.mapZoomInput]) input?.addEventListener('input', applyLayoutInputs);
  dom.saveMapLayoutBtn?.addEventListener('click', () => { if (!state.mapKey) return; state.mapLayouts[state.mapKey] = { ...state.mapLayout }; if (dom.mapStatus) dom.mapStatus.textContent = 'Map alignment saved.'; scheduleSessionSave(true); });
  dom.resetMapLayoutBtn?.addEventListener('click', () => { state.mapLayout = sanitizeLayout(MAP_LAYOUT_DEFAULTS[state.mapKey] || EMPTY_LAYOUT); delete state.mapLayouts[state.mapKey]; syncMapControls(); scheduleSessionSave(true); });
  dom.nukeLayerABtn?.addEventListener('click', () => setNukeLayer('A')); dom.nukeLayerBBtn?.addEventListener('click', () => setNukeLayer('B'));
  dom.teamCards?.addEventListener('click', (event) => { const card = event.target instanceof Element ? event.target.closest('[data-team-id]') : null; if (card) openStats(card.getAttribute('data-team-id') || ''); });
  dom.closeStatsBtn?.addEventListener('click', closeStats);
  dom.statsScopeTabs?.addEventListener('click', (event) => { const button = event.target instanceof Element ? event.target.closest('[data-stats-scope]') : null; if (!button) return; state.statsScope = button.getAttribute('data-stats-scope') === 'full' ? 'full' : 'current'; syncStatTabs(); renderStatsOverlay(); });
  dom.statsCategoryTabs?.addEventListener('click', (event) => { const button = event.target instanceof Element ? event.target.closest('[data-stats-category]') : null; if (!button) return; const value = button.getAttribute('data-stats-category'); state.statsCategory = value === 'utility' || value === 'performance' ? value : 'general'; syncStatTabs(); renderStatsOverlay(); });
  dom.warningsBtn?.addEventListener('click', () => dom.warningsPanel?.classList.toggle('hidden'));
  bindCanvasInput(); bindKeyboard();
}
function setNukeLayer(layer) { state.nukeLayer = layer; state.mapImage = state.nukeImages[layer]; dom.nukeLayerABtn?.classList.toggle('is-active', layer === 'A'); dom.nukeLayerBBtn?.classList.toggle('is-active', layer === 'B'); }
function syncStatTabs() {
  dom.statsScopeTabs?.querySelectorAll('[data-stats-scope]').forEach((row) => row.classList.toggle('is-active', row.getAttribute('data-stats-scope') === state.statsScope));
  dom.statsCategoryTabs?.querySelectorAll('[data-stats-category]').forEach((row) => row.classList.toggle('is-active', row.getAttribute('data-stats-category') === state.statsCategory));
}
function bindCanvasInput() {
  const canvas = dom.viewerCanvas; if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) return; event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    const now = performance.now(); const close = Math.hypot(event.clientX - state.lastRightClick.x, event.clientY - state.lastRightClick.y) < 18;
    if (now - state.lastRightClick.at < 350 && close) { state.cameraPanX = 0; state.cameraPanY = 0; state.followSteamId = ''; if (dom.followSelect instanceof HTMLSelectElement) dom.followSelect.value = ''; state.panDrag = null; }
    else state.panDrag = { x: event.clientX, y: event.clientY, panX: state.cameraPanX, panY: state.cameraPanY };
    state.lastRightClick = { at: now, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => { if (!state.panDrag) return; state.followSteamId = ''; if (dom.followSelect instanceof HTMLSelectElement) dom.followSelect.value = ''; state.cameraPanX = state.panDrag.panX + event.clientX - state.panDrag.x; state.cameraPanY = state.panDrag.panY + event.clientY - state.panDrag.y; });
  const stop = () => { state.panDrag = null; }; canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('wheel', (event) => {
    if (!state.bundle || event.deltaY === 0) return;
    const metrics = canvasMetrics(); if (!metrics) return;
    const previousZoom = state.mapLayout.zoom; const nextZoom = clamp(previousZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), .5, 3);
    if (nextZoom === previousZoom) return;
    if (event.deltaY < 0) {
      const rect = canvas.getBoundingClientRect(); const cursorX = event.clientX - rect.left, cursorY = event.clientY - rect.top;
      const centerX = (metrics.bounds.minX + metrics.bounds.maxX) / 2, centerY = (metrics.bounds.minY + metrics.bounds.maxY) / 2;
      const followed = state.playerState[state.followSteamId]; const factor = nextZoom / previousZoom;
      const followPanX = followed ? -(finite(followed.x) - centerX) * metrics.worldScale : 0;
      const followPanY = followed ? (finite(followed.y) - centerY) * metrics.worldScale : 0;
      const nextFollowPanX = followPanX * factor, nextFollowPanY = followPanY * factor;
      const totalPanX = state.cameraPanX + followPanX, totalPanY = state.cameraPanY + followPanY;
      state.cameraPanX = cursorX - metrics.width / 2 - (cursorX - metrics.width / 2 - totalPanX) * factor - nextFollowPanX;
      state.cameraPanY = cursorY - metrics.height / 2 - (cursorY - metrics.height / 2 - totalPanY) * factor - nextFollowPanY;
    }
    state.mapLayout = { ...state.mapLayout, zoom: nextZoom }; syncMapControls(); event.preventDefault();
  }, { passive: false });
}
function bindKeyboard() {
  window.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
    if (event.key === 'Escape' && state.statsOpen) { closeStats(); event.preventDefault(); return; }
    if (typing || !state.bundle) return;
    if (event.code === 'Space') { setPlaying(!state.playing); event.preventDefault(); }
    else if (event.key === 'ArrowLeft') { event.shiftKey ? jumpRound(-1) : setTick(state.tick - tickRate() * 5, { reset: true }); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { event.shiftKey ? jumpRound(1) : setTick(state.tick + tickRate() * 5, { reset: true }); event.preventDefault(); }
    else if (event.key === 'Tab') { setScoreboard(true); event.preventDefault(); }
    else if (event.key === 'Alt') { state.showWeapons = true; event.preventDefault(); }
  });
  window.addEventListener('keyup', (event) => { if (event.key === 'Tab') { setScoreboard(false); event.preventDefault(); } if (event.key === 'Alt') state.showWeapons = false; });
  window.addEventListener('blur', () => { setScoreboard(false); state.showWeapons = false; });
}
function animationFrame(now) {
  const elapsed = state.lastFrameMs ? Math.min(100, now - state.lastFrameMs) : 0; state.lastFrameMs = now;
  if (state.playing && state.bundle && !state.timelineScrubbing) {
    const next = state.tickFloat + elapsed / 1000 * tickRate() * state.speed;
    if (next >= totalTicks()) { setTick(totalTicks(), { persist: true }); setPlaying(false); } else setTick(next, { persist: false });
  }
  renderCanvas(); state.frameId = requestAnimationFrame(animationFrame);
}
async function initialize() {
  bindUi(); setControlsEnabled(false); syncPreferenceControls(); syncMapControls();
  if (!bridge) { setStatus('The secure Electron bridge is unavailable.', 'error'); return; }
  bridge.onParseProgress?.((progress) => setLoading(true, { percent: finite(progress.percent, finite(progress.progress) * 100), stage: progress.stage || 'Parsing demo', message: progress.message || 'Reading demo data…' }));
  try {
    const restored = await bridge.restoreSession();
    if (restored) await acceptDescriptor(restored, 'restore');
  } catch (error) { setStatus(`Session restore failed: ${error instanceof Error ? error.message : String(error)}`, 'error'); }
  state.frameId = requestAnimationFrame(animationFrame);
}

initialize();
