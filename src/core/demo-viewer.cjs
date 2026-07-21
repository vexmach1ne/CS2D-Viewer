const fs = require('node:fs');
const path = require('node:path');
const demoparser = require('@laihoe/demoparser2');

const TICK_RATE = 64;
const SAMPLE_STEP = 8;
const VIEWER_SCHEMA = 'viewer-v1';
const VIEWER_VERSION = VIEWER_SCHEMA;
const PARSER_VERSION = '0.41.3';
const GRENADE_MAX_FLIGHT_TICKS_DEFAULT = TICK_RATE * 8;
const INFERNO_CELL_WORLD_SIZE = 12;
const INFERNO_EFFECTIVE_RADIUS_DEFAULT = 120;
const eventWarningSinks = new WeakMap();

/**
 * @typedef {object} ParseWarning
 * @property {string} code
 * @property {string} stage
 * @property {string} message
 * @property {string=} event
 * @property {string=} field
 */

/**
 * @typedef {object} ParseProgress
 * @property {string} stage
 * @property {number} progress Value in the inclusive range 0..1.
 * @property {number} percent Integer percentage in the inclusive range 0..100.
 * @property {string} message
 */

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error || 'Unknown parser error');
}

function pushWarning(warnings, warning) {
  if (!Array.isArray(warnings)) {
    return;
  }
  const normalized = {
    code: String(warning?.code || 'partial_parse'),
    stage: String(warning?.stage || 'parse'),
    message: String(warning?.message || 'Some demo data could not be parsed.'),
    ...(warning?.event ? { event: String(warning.event) } : {}),
    ...(warning?.field ? { field: String(warning.field) } : {}),
  };
  const duplicate = warnings.some(
    (row) =>
      row?.code === normalized.code &&
      row?.stage === normalized.stage &&
      row?.message === normalized.message &&
      row?.event === normalized.event &&
      row?.field === normalized.field
  );
  if (!duplicate) {
    warnings.push(normalized);
  }
}

/**
 * Emit a stable progress payload without allowing UI callback errors to abort parsing.
 *
 * @param {((progress: ParseProgress) => void) | undefined} onProgress
 * @param {string} stage
 * @param {number} progress
 * @param {string} message
 */
function reportProgress(onProgress, stage, progress, message) {
  if (typeof onProgress !== 'function') {
    return;
  }
  const normalized = Math.max(0, Math.min(1, num(progress)));
  try {
    onProgress({
      stage: String(stage || 'parse'),
      progress: normalized,
      percent: Math.round(normalized * 100),
      message: String(message || ''),
    });
  } catch (_error) {
    // Progress reporting is observational; parsing remains authoritative.
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

function parseBooleanFlag(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
  }
  return Boolean(value);
}

function sortByTick(rows) {
  return safeArray(rows).sort((a, b) => num(a.tick) - num(b.tick));
}

function sideFromTeam(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === '3' || text === 'CT' || text === 'COUNTERTERRORIST' || text === 'COUNTER-TERRORIST') {
    return 'CT';
  }
  if (text === '2' || text === 'T' || text === 'TERRORIST') {
    return 'T';
  }
  return '?';
}

function normalizeWeaponName(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^weapon_/, '')
    .replace(/_/g, ' ');
  if (!key) {
    return '';
  }
  if (
    key.includes('knife') ||
    key.includes('bayonet') ||
    key.includes('karambit') ||
    key.includes('dagger') ||
    key.includes('falchion') ||
    key.includes('bowie') ||
    key.includes('stiletto') ||
    key.includes('ursus') ||
    key.includes('talon') ||
    key.includes('skeleton') ||
    key.includes('nomad') ||
    key.includes('survival') ||
    key.includes('paracord') ||
    key.includes('navaja')
  ) {
    return 'knife';
  }
  const aliases = {
    usp_silencer: 'usp-s',
    'usp silencer': 'usp-s',
    usp: 'usp-s',
    ak47: 'ak-47',
    m4a1_silencer: 'm4a1-s',
    'm4a1 silencer': 'm4a1-s',
    m4a1: 'm4a4',
    mac10: 'mac-10',
    hkp2000: 'p2000',
    cz75a: 'cz75-auto',
    hegrenade: 'he',
    flashbang: 'flash',
    smokegrenade: 'smoke',
    incgrenade: 'incendiary',
    decoy: 'decoy',
    'c4 explosive': 'c4',
    c4explosive: 'c4',
    bomb: 'c4',
    inferno: 'inferno',
    knife_t: 'knife',
    knife_ct: 'knife',
    knife: 'knife',
  };
  return aliases[key] || key;
}

function normalizeHitgroup(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '');
  if (!raw) {
    return '';
  }
  if (raw === '1' || raw === 'head') {
    return 'head';
  }
  if (raw === '2' || raw === 'chest') {
    return 'chest';
  }
  if (raw === '3' || raw === 'stomach') {
    return 'stomach';
  }
  if (raw === '4' || raw === 'leftarm') {
    return 'leftarm';
  }
  if (raw === '5' || raw === 'rightarm') {
    return 'rightarm';
  }
  if (raw === '6' || raw === 'leftleg') {
    return 'leftleg';
  }
  if (raw === '7' || raw === 'rightleg') {
    return 'rightleg';
  }
  return raw;
}

function parseBlindDurationSeconds(row) {
  const keys = [
    'blind_duration',
    'flash_duration',
    'duration',
    'flashtime',
    'blindtime',
    'm_flFlashDuration',
  ];
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value) && value > 0) {
      return Math.max(0.1, Math.min(12, value));
    }
  }
  return 2.2;
}

function inferBombSiteFromRow(row) {
  const keys = ['site', 'bomb_site', 'site_id', 'siteid', 'bombsite', 'place_name', 'site_name'];
  for (const key of keys) {
    const value = row?.[key];
    if (value == null) {
      continue;
    }
    const text = String(value).trim().toUpperCase();
    if (!text) {
      continue;
    }
    if (text === 'A' || text === 'B') {
      return text;
    }
    if (text === '0') {
      return 'A';
    }
    if (text === '1') {
      return 'B';
    }
    if (text.includes('BOMB') && text.includes('A')) {
      return 'A';
    }
    if (text.includes('BOMB') && text.includes('B')) {
      return 'B';
    }
    if (/^[AB]SITE$/.test(text)) {
      return text.charAt(0);
    }
  }
  return '';
}

function grenadeTypeFromWeapon(value) {
  const weapon = normalizeWeaponName(value);
  if (weapon === 'flash') {
    return 'flash';
  }
  if (weapon === 'he') {
    return 'he';
  }
  if (weapon === 'smoke') {
    return 'smoke';
  }
  if (weapon === 'decoy') {
    return 'decoy';
  }
  if (weapon === 'molotov' || weapon === 'incendiary' || weapon === 'inferno') {
    return 'inferno';
  }
  return '';
}

function grenadeTypeFromProjectileClass(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) {
    return '';
  }
  if (text.includes('flash')) {
    return 'flash';
  }
  if (text.includes('hegrenade') || text.includes('he_grenade') || text.includes('he')) {
    return 'he';
  }
  if (text.includes('smoke')) {
    return 'smoke';
  }
  if (text.includes('molotov') || text.includes('inc') || text.includes('inferno')) {
    return 'inferno';
  }
  if (text.includes('decoy')) {
    return 'decoy';
  }
  return '';
}

function parseEventSafe(filePath, knownEvents, eventName, playerExtra = [], otherExtra = [], warningSink) {
  // Do not hard-fail on listGameEvents mismatch. Some demos still parse events correctly even when
  // the event name is not listed by listGameEvents().
  const warnings = warningSink || eventWarningSinks.get(knownEvents);
  try {
    return safeArray(demoparser.parseEvent(filePath, eventName, playerExtra, otherExtra));
  } catch (error) {
    pushWarning(warnings, {
      code: 'event_parse_failed',
      stage: 'events',
      event: eventName,
      message: `Could not parse ${eventName}: ${errorMessage(error)}`,
    });
    return [];
  }
}

function normalizeTeamDisplayName(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    return '';
  }
  const upper = text.toUpperCase();
  if (
    upper === 'CT' ||
    upper === 'T' ||
    upper === 'COUNTER-TERRORIST' ||
    upper === 'COUNTERTERRORIST' ||
    upper === 'COUNTER-TERRORISTS' ||
    upper === 'COUNTERTERRORISTS' ||
    upper === 'TERRORIST' ||
    upper === 'TERRORISTS' ||
    upper === '?'
  ) {
    return '';
  }
  if (/^\d+$/.test(text)) {
    return '';
  }
  return text;
}

function pickTeamNameFromKeys(row, keys) {
  for (const key of safeArray(keys)) {
    const value = normalizeTeamDisplayName(row?.[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function extractRoundTeamNames(row) {
  const ctName = pickTeamNameFromKeys(row, [
    'ct_name',
    'ct_clan_name',
    'ct_clan',
    'ct_team_name',
    'counter_terrorist_name',
    'counter_terrorists_name',
    'counterterrorist_name',
    'counterterrorists_name',
  ]);
  const tName = pickTeamNameFromKeys(row, [
    't_name',
    't_clan_name',
    't_clan',
    't_team_name',
    'terrorist_name',
    'terrorists_name',
  ]);
  if (ctName || tName) {
    return { ctTeamName: ctName, tTeamName: tName };
  }

  const team1Name = pickTeamNameFromKeys(row, ['team1_name', 'team_1_name', 'team1_clan_name', 'team_1_clan_name']);
  const team2Name = pickTeamNameFromKeys(row, ['team2_name', 'team_2_name', 'team2_clan_name', 'team_2_clan_name']);
  const team1Side = sideFromTeam(row?.team1_side || row?.team_1_side || row?.team1_team_name || row?.team_1_team_name);
  const team2Side = sideFromTeam(row?.team2_side || row?.team_2_side || row?.team2_team_name || row?.team_2_team_name);

  let ctFallback = '';
  let tFallback = '';
  if (team1Name && team1Side === 'CT') {
    ctFallback = team1Name;
  } else if (team1Name && team1Side === 'T') {
    tFallback = team1Name;
  }
  if (team2Name && team2Side === 'CT') {
    ctFallback = team2Name;
  } else if (team2Name && team2Side === 'T') {
    tFallback = team2Name;
  }
  return { ctTeamName: ctFallback, tTeamName: tFallback };
}

function pickMostFrequentName(rows) {
  const counts = new Map();
  for (const row of safeArray(rows)) {
    const value = normalizeTeamDisplayName(row);
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = '';
  let bestCount = -1;
  for (const [name, count] of counts.entries()) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function deriveTeamNamesFromRounds(rounds) {
  const ctNames = safeArray(rounds).map((row) => row?.ctTeamName || '');
  const tNames = safeArray(rounds).map((row) => row?.tTeamName || '');
  return {
    ct: pickMostFrequentName(ctNames),
    t: pickMostFrequentName(tNames),
  };
}

function buildRounds(roundStartsInput, roundEndsInput, freezeEndsInput) {
  let roundStarts = sortByTick(roundStartsInput);
  const roundEnds = sortByTick(roundEndsInput);
  const freezeEnds = sortByTick(freezeEndsInput);
  if (!roundStarts.length && freezeEnds.length) {
    // Approximate a round start shortly before freeze-end when explicit round_start is missing.
    roundStarts = freezeEnds.map((row, idx) => ({
      tick: Math.max(0, num(row.tick) - TICK_RATE * 15),
      round: idx + 1,
    }));
  }
  if (!roundStarts.length && roundEnds.length) {
    // Fallback: infer starts from round_end boundaries.
    roundStarts = roundEnds.map((row, idx) => ({
      tick: idx === 0 ? 0 : Math.max(0, num(roundEnds[idx - 1].tick) + 1),
      round: idx + 1,
    }));
  }
  if (!roundStarts.length) {
    return [];
  }

  const starts = [];
  for (const row of roundStarts) {
    const tick = num(row.tick);
    const prev = starts[starts.length - 1];
    if (!prev || num(prev.tick) !== tick) {
      starts.push(row);
    }
  }

  const rounds = [];
  let endIdx = 0;
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const startTick = num(start.tick);
    const nextStartTick = i + 1 < starts.length ? num(starts[i + 1].tick) : null;

    while (endIdx < roundEnds.length && num(roundEnds[endIdx].tick) < startTick) {
      endIdx += 1;
    }

    let scan = endIdx;
    let endMeta = null;
    while (scan < roundEnds.length) {
      const candidateTick = num(roundEnds[scan].tick);
      if (nextStartTick != null && candidateTick >= nextStartTick) {
        break;
      }
      endMeta = roundEnds[scan];
      scan += 1;
    }

    const endTick = endMeta
      ? num(endMeta.tick)
      : nextStartTick != null
      ? nextStartTick - 1
      : startTick + TICK_RATE * 115;

    let freezeEndTick = null;
    for (const freezeRow of freezeEnds) {
      const ft = num(freezeRow.tick);
      if (ft < startTick) {
        continue;
      }
      if (ft > endTick) {
        break;
      }
      freezeEndTick = ft;
      break;
    }

    const startTeamNames = extractRoundTeamNames(start);
    const endTeamNames = extractRoundTeamNames(endMeta || {});
    rounds.push({
      round: Number.isFinite(num(start.round, NaN)) ? num(start.round) : i + 1,
      startTick,
      freezeEndTick,
      endTick: Math.max(startTick, endTick),
      winner: sideFromTeam(endMeta?.winner || null),
      reason: endMeta?.reason || null,
      ctTeamName: startTeamNames.ctTeamName || endTeamNames.ctTeamName || '',
      tTeamName: startTeamNames.tTeamName || endTeamNames.tTeamName || '',
    });
  }

  return rounds;
}

function pickCoord(row, primary, secondary, fallback = null) {
  const a = num(row?.[primary], NaN);
  if (Number.isFinite(a)) {
    return a;
  }
  const b = num(row?.[secondary], NaN);
  if (Number.isFinite(b)) {
    return b;
  }
  return fallback;
}

function pickActorSteamId(row) {
  const candidates = [
    row?.user_steamid,
    row?.attacker_steamid,
    row?.thrower_steamid,
    row?.player_steamid,
    row?.steamid,
    row?.userid,
    row?.playerid,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  const nameFallback = pickActorName(row).toLowerCase().replace(/\s+/g, '_');
  return nameFallback ? `name:${nameFallback}` : '';
}

function pickActorName(row) {
  const candidates = [row?.user_name, row?.attacker_name, row?.thrower_name, row?.player_name, row?.name];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function mapNadeRows(type, rows, endTickOffset = 0, radius = 120) {
  return safeArray(rows).map((row) => {
    const tick = num(row.tick);
    return {
      type,
      tick,
      endTick: tick + Math.max(0, num(endTickOffset)),
      entityId: Number.isFinite(num(row.entityid, NaN)) ? Math.round(num(row.entityid)) : null,
      throwerSteamId: pickActorSteamId(row),
      throwerName: pickActorName(row),
      x: round2(pickCoord(row, 'x', 'user_X', 0)),
      y: round2(pickCoord(row, 'y', 'user_Y', 0)),
      radius: round2(radius),
    };
  });
}

function parseInfernoRadius(row) {
  const candidates = [
    'radius',
    'fire_radius',
    'burn_radius',
    'inferno_radius',
    'm_radius',
    'spread_radius',
  ];
  for (const key of candidates) {
    const value = num(row?.[key], NaN);
    if (Number.isFinite(value) && value > 20 && value < 500) {
      return value;
    }
  }
  return INFERNO_EFFECTIVE_RADIUS_DEFAULT;
}

function seededUnit(seedInput) {
  let seed = Math.round(Math.abs(num(seedInput, 1)));
  if (!seed) {
    seed = 1;
  }
  seed = (seed ^ (seed << 13)) >>> 0;
  seed = (seed ^ (seed >>> 17)) >>> 0;
  seed = (seed ^ (seed << 5)) >>> 0;
  return ((seed >>> 0) % 1000000) / 1000000;
}

function buildInfernoCells(centerX, centerY, entityId, maxRadiusInput = INFERNO_EFFECTIVE_RADIUS_DEFAULT, cellStepInput = INFERNO_CELL_WORLD_SIZE) {
  const seedBase = Math.round(Math.abs(num(entityId, 0))) + Math.round(Math.abs(centerX) * 10) + Math.round(Math.abs(centerY) * 10);
  const spin = seededUnit(seedBase + 19) * Math.PI * 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const cellStep = Math.max(6, num(cellStepInput, INFERNO_CELL_WORLD_SIZE));
  const maxRadius = Math.max(cellStep * 2, num(maxRadiusInput, INFERNO_EFFECTIVE_RADIUS_DEFAULT));
  const halfGrid = Math.max(2, Math.ceil(maxRadius / cellStep) + 1);
  const candidates = [];
  for (let gx = -halfGrid; gx <= halfGrid; gx += 1) {
    for (let gy = -halfGrid; gy <= halfGrid; gy += 1) {
      const oxBase = gx * cellStep;
      const oyBase = gy * cellStep;
      const dist = Math.sqrt(oxBase * oxBase + oyBase * oyBase);
      if (dist > maxRadius) {
        continue;
      }
      candidates.push({ oxBase, oyBase, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  return candidates.map((candidate, idx) => {
    const jitterRange = Math.max(1.5, Math.min(4, cellStep * 0.28));
    const jitterX = (seededUnit(seedBase + idx * 37 + 11) - 0.5) * jitterRange;
    const jitterY = (seededUnit(seedBase + idx * 37 + 17) - 0.5) * jitterRange;
    const ox = num(candidate.oxBase) + jitterX;
    const oy = num(candidate.oyBase) + jitterY;
    const rx = ox * cos - oy * sin;
    const ry = ox * sin + oy * cos;
    const spreadFactor = Math.max(0, Math.min(1, num(candidate.dist) / maxRadius));
    const delayTick =
      idx === 0
        ? 0
        : Math.round(TICK_RATE * (0.035 + spreadFactor * 0.22 + seededUnit(seedBase + idx * 13) * 0.05));
    return {
      x: round2(centerX + rx),
      y: round2(centerY + ry),
      delayTick: Math.max(0, delayTick),
    };
  });
}

function buildInfernoNadeRows(startRowsInput, expireRowsInput, extinguishRowsInput, fallbackTicks = TICK_RATE * 7) {
  const starts = sortByTick(startRowsInput);
  const expires = sortByTick(expireRowsInput);
  const extinguishes = sortByTick(extinguishRowsInput);
  const expiresByEntity = new Map();

  const addExpireRow = (entityId, row) => {
    if (!Number.isFinite(num(entityId, NaN))) {
      return;
    }
    const key = Math.round(num(entityId));
    if (!expiresByEntity.has(key)) {
      expiresByEntity.set(key, []);
    }
    expiresByEntity.get(key).push(row);
  };

  for (const row of expires) {
    addExpireRow(row?.entityid, row);
  }

  for (const row of extinguishes) {
    addExpireRow(row?.entityid, row);
  }

  const consumeExpireTick = (entityId, startTick) => {
    if (!Number.isFinite(num(entityId, NaN))) {
      return null;
    }
    const key = Math.round(num(entityId));
    const list = expiresByEntity.get(key) || [];
    while (list.length) {
      const row = list[0];
      const tick = Math.round(num(row?.tick));
      if (tick < startTick) {
        list.shift();
        continue;
      }
      list.shift();
      return tick;
    }
    return null;
  };

  return starts.map((row) => {
    const tick = Math.round(num(row?.tick));
    const entityId = Number.isFinite(num(row?.entityid, NaN)) ? Math.round(num(row.entityid)) : null;
    const expireTick = consumeExpireTick(entityId, tick);
    const endTick = Number.isFinite(expireTick) ? Math.max(tick + 1, expireTick) : tick + Math.max(1, Math.round(num(fallbackTicks, TICK_RATE * 7)));
    const centerX = round2(pickCoord(row, 'x', 'user_X', 0));
    const centerY = round2(pickCoord(row, 'y', 'user_Y', 0));
    const infernoRadius = round2(parseInfernoRadius(row));

    return {
      type: 'inferno',
      tick,
      endTick,
      entityId,
      throwerSteamId: pickActorSteamId(row),
      throwerName: pickActorName(row),
      x: centerX,
      y: centerY,
      radius: infernoRadius,
      fireCellSize: INFERNO_CELL_WORLD_SIZE,
      fireCells: buildInfernoCells(centerX, centerY, entityId, infernoRadius, INFERNO_CELL_WORLD_SIZE),
    };
  });
}

function mapProjectileRows(type, rows) {
  return safeArray(rows).map((row) => ({
    tick: Math.round(num(row.tick)),
    throwerSteamId: pickActorSteamId(row),
    throwerName: pickActorName(row),
    type: String(type || ''),
    x: round2(pickCoord(row, 'x', 'user_X', 0)),
    y: round2(pickCoord(row, 'y', 'user_Y', 0)),
  }));
}

function normalizeInventoryItems(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeWeaponName(entry)).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => normalizeWeaponName(entry)).filter(Boolean);
      }
    } catch (_error) {
      // Fall back to delimiter parse below.
    }
    return trimmed
      .split(/[|,;]/g)
      .map((entry) => normalizeWeaponName(entry))
      .filter(Boolean);
  }
  if (value && typeof value === 'object') {
    const entries = Array.isArray(value.items) ? value.items : Object.values(value);
    return entries.map((entry) => normalizeWeaponName(entry?.weapon_name || entry?.name || entry)).filter(Boolean);
  }
  return [];
}

function dedupeProjectileRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of safeArray(rows)) {
    const key = [
      Math.round(num(row.tick)),
      String(row.throwerSteamId || ''),
      String(row.type || ''),
      round2(num(row.x)),
      round2(num(row.y)),
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}

function dedupeUtilityThrows(rows) {
  const sorted = [...safeArray(rows)].sort(
    (a, b) => num(a?.tick) - num(b?.tick) || String(a?.throwerSteamId || '').localeCompare(String(b?.throwerSteamId || ''))
  );
  const lastTickByThrowerType = new Map();
  const out = [];
  for (const row of sorted) {
    const tick = Math.round(num(row?.tick));
    const key = `${String(row?.throwerSteamId || '')}|${String(row?.type || '')}`;
    const previousTick = lastTickByThrowerType.get(key);
    if (Number.isFinite(previousTick) && Math.abs(tick - previousTick) <= 1) {
      continue;
    }
    lastTickByThrowerType.set(key, tick);
    out.push(row);
  }
  return out;
}

function getGrenadeMaxFlightTicks(type) {
  const key = String(type || '').toLowerCase();
  if (key === 'smoke') {
    return TICK_RATE * 10;
  }
  if (key === 'inferno') {
    return TICK_RATE * 6;
  }
  if (key === 'decoy') {
    return TICK_RATE * 8;
  }
  return GRENADE_MAX_FLIGHT_TICKS_DEFAULT;
}

function buildGrenadeProjectiles(thrownRows, bounceRows, detonationRows, rounds = []) {
  const projectileList = [];
  const bounceByKey = new Map();
  const bounceByThrower = new Map();
  const bounceCursorByKey = new Map();
  const bounceCursorByThrower = new Map();
  const endpointByKey = new Map();
  const endpointByThrower = new Map();
  const endpointCursorByKey = new Map();
  const endpointCursorByThrower = new Map();

  const addToMapArray = (map, key, row) => {
    if (!key) {
      return;
    }
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  };

  for (const row of safeArray(bounceRows)) {
    const sid = String(row.throwerSteamId || '');
    const type = String(row.type || '');
    if (sid && type) {
      addToMapArray(bounceByKey, `${sid}|${type}`, row);
    }
    if (sid) {
      addToMapArray(bounceByThrower, sid, row);
    }
  }

  for (const row of safeArray(detonationRows)) {
    const sid = String(row.throwerSteamId || '');
    const type = String(row.type || '');
    if (sid && type) {
      addToMapArray(endpointByKey, `${sid}|${type}`, row);
    }
    if (sid) {
      addToMapArray(endpointByThrower, sid, row);
    }
  }

  for (const list of [...bounceByKey.values(), ...bounceByThrower.values(), ...endpointByKey.values(), ...endpointByThrower.values()]) {
    list.sort((a, b) => num(a.tick) - num(b.tick));
  }

  const sortedRounds = safeArray(rounds)
    .map((row) => ({
      startTick: Math.round(num(row.startTick)),
      endTick: Math.round(num(row.endTick)),
    }))
    .filter((row) => Number.isFinite(row.startTick) && Number.isFinite(row.endTick))
    .sort((a, b) => a.startTick - b.startTick);

  const getRoundEndTick = (tick) => {
    const target = Number(tick || 0);
    for (const round of sortedRounds) {
      if (target < round.startTick) {
        break;
      }
      if (target >= round.startTick && target <= round.endTick) {
        return round.endTick;
      }
    }
    return null;
  };

  const consumeEndpoint = (sid, type, startTick, searchEndTick) => {
    const key = sid && type ? `${sid}|${type}` : '';
    if (key && endpointByKey.has(key)) {
      const list = endpointByKey.get(key);
      let idx = num(endpointCursorByKey.get(key), 0);
      while (idx < list.length && num(list[idx].tick) < startTick) {
        idx += 1;
      }
      if (idx < list.length && num(list[idx].tick) <= searchEndTick) {
        endpointCursorByKey.set(key, idx + 1);
        return list[idx];
      }
      endpointCursorByKey.set(key, idx);
    }
    // Fallback by thrower only when event type is missing; keep strict search window.
    if ((!type || type === '?') && sid && endpointByThrower.has(sid)) {
      const list = endpointByThrower.get(sid);
      let idx = num(endpointCursorByThrower.get(sid), 0);
      while (idx < list.length && num(list[idx].tick) < startTick) {
        idx += 1;
      }
      if (idx < list.length && num(list[idx].tick) <= searchEndTick) {
        endpointCursorByThrower.set(sid, idx + 1);
        return list[idx];
      }
      endpointCursorByThrower.set(sid, idx);
    }
    return null;
  };

  const consumeBounces = (sid, type, startTick, endTick) => {
    const merged = [];
    const pushRange = (map, cursorMap, key) => {
      if (!key || !map.has(key)) {
        return;
      }
      const list = map.get(key);
      let idx = num(cursorMap.get(key), 0);
      while (idx < list.length && num(list[idx].tick) < startTick) {
        idx += 1;
      }
      while (idx < list.length && num(list[idx].tick) <= endTick) {
        merged.push(list[idx]);
        idx += 1;
      }
      cursorMap.set(key, idx);
    };

    pushRange(bounceByKey, bounceCursorByKey, sid && type ? `${sid}|${type}` : '');
    if (!merged.length) {
      pushRange(bounceByThrower, bounceCursorByThrower, sid);
    }
    merged.sort((a, b) => num(a.tick) - num(b.tick));
    return merged;
  };

  let sequence = 0;
  for (const thrown of safeArray(thrownRows)) {
    const startTick = Math.round(num(thrown.tick));
    const sid = String(thrown.throwerSteamId || '');
    const type = String(thrown.type || '');
    if (!sid || !type) {
      continue;
    }
    const roundEndTick = getRoundEndTick(startTick);
    const maxFlightTick = startTick + getGrenadeMaxFlightTicks(type);
    const searchEndTick = roundEndTick == null ? maxFlightTick : Math.min(maxFlightTick, roundEndTick);
    const endpoint = consumeEndpoint(sid, type, startTick, searchEndTick);
    const fallbackEndTick = Math.min(startTick + TICK_RATE * 3, searchEndTick);
    const endTick = Math.max(startTick + 1, Math.round(num(endpoint?.tick, fallbackEndTick)));
    const endX = round2(num(endpoint?.x, thrown.x));
    const endY = round2(num(endpoint?.y, thrown.y));
    const bounces = consumeBounces(sid, type, startTick, endTick);

    const points = [
      { tick: startTick, x: round2(num(thrown.x)), y: round2(num(thrown.y)), kind: 'throw' },
      ...bounces.map((row) => ({
        tick: Math.round(num(row.tick)),
        x: round2(num(row.x)),
        y: round2(num(row.y)),
        kind: 'bounce',
      })),
      { tick: endTick, x: endX, y: endY, kind: 'impact' },
    ]
      .filter((row) => Number.isFinite(num(row.x, NaN)) && Number.isFinite(num(row.y, NaN)))
      .sort((a, b) => num(a.tick) - num(b.tick));

    if (points.length < 2) {
      continue;
    }

    projectileList.push({
      id: `${sid}_${type}_${startTick}_${sequence}`,
      type,
      throwerSteamId: sid,
      throwerName: String(thrown.throwerName || ''),
      startTick,
      endTick,
      points,
      bounceCount: bounces.length,
    });
    sequence += 1;
  }

  return projectileList;
}

function buildGrenadeProjectilesFromTickRows(grenadeRows, rounds = []) {
  const byEntity = new Map();
  const add = (entityId, row) => {
    if (!byEntity.has(entityId)) {
      byEntity.set(entityId, []);
    }
    byEntity.get(entityId).push(row);
  };

  for (const row of safeArray(grenadeRows)) {
    const entityId = Math.round(num(row?.grenade_entity_id, NaN));
    const type = grenadeTypeFromProjectileClass(row?.grenade_type);
    const tick = Math.round(num(row?.tick, NaN));
    const x = round2(num(row?.x, NaN));
    const y = round2(num(row?.y, NaN));
    if (!Number.isFinite(entityId) || !type || !Number.isFinite(tick) || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    add(entityId, {
      entityId,
      type,
      tick,
      x,
      y,
      throwerSteamId: String(row?.steamid || ''),
      throwerName: String(row?.name || ''),
    });
  }

  const roundRows = safeArray(rounds)
    .map((row) => ({
      startTick: Math.round(num(row?.startTick, NaN)),
      endTick: Math.round(num(row?.endTick, NaN)),
    }))
    .filter((row) => Number.isFinite(row.startTick) && Number.isFinite(row.endTick))
    .sort((a, b) => a.startTick - b.startTick);
  const inRound = (tick) => {
    for (const row of roundRows) {
      if (tick < row.startTick) {
        return false;
      }
      if (tick <= row.endTick) {
        return true;
      }
    }
    return !roundRows.length;
  };

  const out = [];
  const SEGMENT_GAP_TICKS = Math.max(8, Math.round(TICK_RATE * 0.5));
  const SEGMENT_MAX_STEP_UNITS = 260;
  let seq = 0;
  const getRoundIndexForTick = (tick) => {
    for (let i = 0; i < roundRows.length; i += 1) {
      const row = roundRows[i];
      if (tick < row.startTick) {
        return -1;
      }
      if (tick <= row.endTick) {
        return i;
      }
    }
    return roundRows.length ? -1 : 0;
  };

  const emitSegment = (segmentRows) => {
    const compact = [];
    for (const row of safeArray(segmentRows)) {
      if (compact.length && Number(compact[compact.length - 1].tick) === Number(row.tick)) {
        compact[compact.length - 1] = row;
      } else {
        compact.push(row);
      }
    }
    if (compact.length < 2) {
      return;
    }
    const first = compact[0];
    const maxFlightTick = Number(first.tick) + getGrenadeMaxFlightTicks(first.type);
    const trimmed = compact.filter((row) => Number(row.tick) <= maxFlightTick);
    if (trimmed.length < 2) {
      return;
    }
    const stride = trimmed.length > 420 ? 6 : trimmed.length > 220 ? 4 : trimmed.length > 110 ? 3 : 2;
    const points = [];
    for (let i = 0; i < trimmed.length; i += 1) {
      if (i !== 0 && i !== trimmed.length - 1 && i % stride !== 0) {
        continue;
      }
      const row = trimmed[i];
      points.push({
        tick: row.tick,
        x: row.x,
        y: row.y,
        kind: i === 0 ? 'throw' : i === trimmed.length - 1 ? 'impact' : 'path',
      });
    }
    if (points.length < 2) {
      return;
    }
    const last = trimmed[trimmed.length - 1];
    out.push({
      id: `${first.throwerSteamId || 'unknown'}_${first.type}_${first.tick}_${first.entityId}_${seq}`,
      type: first.type,
      throwerSteamId: first.throwerSteamId,
      throwerName: first.throwerName,
      startTick: first.tick,
      endTick: Math.max(first.tick + 1, last.tick),
      points,
      bounceCount: 0,
    });
    seq += 1;
  };

  for (const rows of byEntity.values()) {
    rows.sort((a, b) => a.tick - b.tick);
    const filtered = rows.filter((row) => inRound(row.tick));
    if (filtered.length < 2) {
      continue;
    }
    let segmentStart = 0;
    let previous = filtered[0];
    for (let i = 1; i < filtered.length; i += 1) {
      const current = filtered[i];
      const gapTicks = Number(current.tick) - Number(previous.tick);
      const dx = Number(current.x) - Number(previous.x);
      const dy = Number(current.y) - Number(previous.y);
      const dist = Math.hypot(dx, dy);
      const typeChanged = String(current.type || '') !== String(previous.type || '');
      const throwerChanged = String(current.throwerSteamId || '') !== String(previous.throwerSteamId || '');
      const roundChanged = getRoundIndexForTick(Number(current.tick)) !== getRoundIndexForTick(Number(previous.tick));
      const shouldSplit =
        gapTicks <= 0 ||
        gapTicks > SEGMENT_GAP_TICKS ||
        dist > SEGMENT_MAX_STEP_UNITS ||
        typeChanged ||
        throwerChanged ||
        roundChanged;
      if (shouldSplit) {
        emitSegment(filtered.slice(segmentStart, i));
        segmentStart = i;
      }
      previous = current;
    }
    emitSegment(filtered.slice(segmentStart));
  }
  out.sort((a, b) => num(a.startTick) - num(b.startTick));
  return out;
}

function extractMoneySeries(props, preferredKeys = []) {
  const keySet = new Set(
    [
      ...safeArray(preferredKeys),
      'money',
      'cash',
      'account',
      'm_iAccount',
      'account_money',
      'm_iaccount',
      '__money',
    ].map((value) => String(value || '').trim())
  );

  const entries = Object.entries(props || {});
  for (const wanted of keySet) {
    if (!wanted) {
      continue;
    }
    for (const [key, value] of entries) {
      if (String(key) !== wanted) {
        continue;
      }
      const list = safeArray(value);
      if (list.length) {
        return { key, values: list };
      }
    }
  }

  for (const [key, value] of entries) {
    const normalized = String(key || '').trim().toLowerCase();
    if (!normalized || normalized === 'tick' || normalized === 'steamid') {
      continue;
    }
    const looksLikeMoney =
      normalized.includes('money') ||
      normalized.includes('cash') ||
      normalized.includes('account');
    if (!looksLikeMoney) {
      continue;
    }
    const list = safeArray(value);
    if (!list.length) {
      continue;
    }
    if (!list.some((entry) => Number.isFinite(num(entry, NaN)))) {
      continue;
    }
    return { key, values: list };
  }
  return null;
}

function buildMoneyLookup(rawByPlayer) {
  const bySteam = {};
  for (const [steamId, props] of Object.entries(rawByPlayer || {})) {
    const ticks = safeArray(props.__money_tick).length ? safeArray(props.__money_tick) : safeArray(props.tick);
    if (!ticks.length) {
      continue;
    }
    const series = extractMoneySeries(props);
    if (!series || !safeArray(series.values).length) {
      continue;
    }

    const tickToMoney = new Map();
    const sortedTicks = [];
    const limit = Math.min(ticks.length, safeArray(series.values).length);
    for (let i = 0; i < limit; i += 1) {
      const t = num(ticks[i], NaN);
      if (!Number.isFinite(t)) {
        continue;
      }
      const value = num(series.values[i], NaN);
      if (!Number.isFinite(value)) {
        continue;
      }
      const tickInt = Math.round(t);
      tickToMoney.set(tickInt, Math.max(0, Math.round(value)));
      sortedTicks.push(tickInt);
    }
    if (!tickToMoney.size) {
      continue;
    }
    sortedTicks.sort((a, b) => a - b);
    bySteam[String(steamId)] = {
      tickToMoney,
      sortedTicks,
    };
  }
  return bySteam;
}

function getMoneyForTick(moneyLookupBySteam, steamId, tick) {
  const row = moneyLookupBySteam?.[String(steamId)];
  if (!row || typeof row !== 'object') {
    return null;
  }
  const map = row.tickToMoney;
  const ticks = safeArray(row.sortedTicks);
  if (!(map instanceof Map) || !ticks.length) {
    return null;
  }

  const targetTick = Math.round(num(tick, NaN));
  if (!Number.isFinite(targetTick)) {
    return null;
  }
  if (map.has(targetTick)) {
    return map.get(targetTick);
  }

  let lo = 0;
  let hi = ticks.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = ticks[mid];
    if (value <= targetTick) {
      best = value;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best >= 0 && map.has(best)) {
    return map.get(best);
  }
  return null;
}

function enrichRawTicksWithMoney(filePath, rawByPlayerInput, warnings) {
  const rawByPlayer = rawByPlayerInput && typeof rawByPlayerInput === 'object' ? rawByPlayerInput : {};
  let lastParseError = null;
  let parsedMoney = false;
  const candidates = [
    // Controller money service (works on current CS2 demos)
    'CCSPlayerController.CCSPlayerController_InGameMoneyServices.m_iAccount',
    // Additional money-like fields used by some parser/demo variants
    'CCSPlayerController.CCSPlayerController_InGameMoneyServices.m_iStartAccount',
    'CCSPlayerController.CCSPlayerController_InGameMoneyServices.m_iCashSpentThisRound',
    // Legacy/short aliases kept as fallback
    'm_iAccount',
    'money',
    'cash',
    'account',
    'account_money',
  ];
  for (const candidate of candidates) {
    let moneyTicks = null;
    try {
      moneyTicks = demoparser.parseTicks(filePath, ['steamid', candidate], null, null, true, true, null);
    } catch (error) {
      lastParseError = error;
      moneyTicks = null;
    }
    if (!moneyTicks || typeof moneyTicks !== 'object') {
      continue;
    }
    let mergedAny = false;
    for (const [steamId, props] of Object.entries(moneyTicks || {})) {
      const series = extractMoneySeries(props, [candidate]);
      if (!series || !safeArray(series.values).length) {
        continue;
      }
      if (!rawByPlayer[steamId] || typeof rawByPlayer[steamId] !== 'object') {
        rawByPlayer[steamId] = {};
      }
      rawByPlayer[steamId].__money = safeArray(series.values);
      rawByPlayer[steamId].__money_tick = safeArray(props?.tick);
      mergedAny = true;
    }
    if (mergedAny) {
      parsedMoney = true;
      break;
    }
  }
  if (!parsedMoney && lastParseError) {
    pushWarning(warnings, {
      code: 'money_track_parse_failed',
      stage: 'player-tracks',
      field: 'money',
      message: `Player money is unavailable: ${errorMessage(lastParseError)}`,
    });
  }
  return rawByPlayer;
}

function buildTicksByPlayer(rawByPlayer, playerInfo, sampleStep = SAMPLE_STEP) {
  const bySteam = {};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let totalTicks = 0;
  const moneyLookupBySteam = buildMoneyLookup(rawByPlayer);

  const playerNameBySteam = new Map(
    safeArray(playerInfo).map((row) => [String(row.steamid || ''), String(row.name || row.steamid || 'Unknown')])
  );

  for (const [steamId, props] of Object.entries(rawByPlayer || {})) {
    const ticks = safeArray(props.tick);
    const xs = safeArray(props.X);
    const ys = safeArray(props.Y);
    const yaws = safeArray(props.yaw);
    const health = safeArray(props.health);
    const isAlive = safeArray(props.is_alive);
    const team = safeArray(props.team_name);
    const weapon = safeArray(props.active_weapon_name);
    const inventory = safeArray(props.inventory);
    const armorValue = safeArray(props.armor_value);
    const hasHelmet = safeArray(props.has_helmet);
    const hasDefuser = safeArray(props.has_defuser);
    const hasDefuseKit = safeArray(props.has_defuse_kit);
    if (!ticks.length) {
      continue;
    }

    const sampled = {
      steamId,
      name: playerNameBySteam.get(steamId) || steamId,
      tick: [],
      x: [],
      y: [],
      yaw: [],
      health: [],
      isAlive: [],
      team: [],
      weapon: [],
      inventory: [],
      armor: [],
      money: [],
      hasHelmet: [],
      hasDefuser: [],
    };

    for (let idx = 0; idx < ticks.length; idx += Math.max(1, Number(sampleStep || SAMPLE_STEP))) {
      const t = num(ticks[idx], NaN);
      const x = num(xs[idx], NaN);
      const y = num(ys[idx], NaN);
      if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      sampled.tick.push(t);
      sampled.x.push(round2(x));
      sampled.y.push(round2(y));
      sampled.yaw.push(round2(num(yaws[idx], 0)));
      sampled.health.push(Math.max(0, Math.round(num(health[idx], 0))));
      sampled.isAlive.push(Boolean(isAlive[idx]));
      sampled.team.push(sideFromTeam(team[idx]));
      sampled.weapon.push(normalizeWeaponName(weapon[idx]));
      sampled.inventory.push(normalizeInventoryItems(inventory[idx]));
      sampled.armor.push(Math.max(0, Math.round(num(armorValue[idx], 0))));
      sampled.money.push(getMoneyForTick(moneyLookupBySteam, steamId, t));
      sampled.hasHelmet.push(Boolean(hasHelmet[idx]));
      sampled.hasDefuser.push(Boolean(hasDefuser[idx] || hasDefuseKit[idx]));

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (t > totalTicks) {
        totalTicks = t;
      }
    }

    const lastIdx = ticks.length - 1;
    if (lastIdx >= 0 && sampled.tick[sampled.tick.length - 1] !== num(ticks[lastIdx])) {
      const t = num(ticks[lastIdx], NaN);
      const x = num(xs[lastIdx], NaN);
      const y = num(ys[lastIdx], NaN);
      if (Number.isFinite(t) && Number.isFinite(x) && Number.isFinite(y)) {
        sampled.tick.push(t);
        sampled.x.push(round2(x));
        sampled.y.push(round2(y));
        sampled.yaw.push(round2(num(yaws[lastIdx], 0)));
        sampled.health.push(Math.max(0, Math.round(num(health[lastIdx], 0))));
        sampled.isAlive.push(Boolean(isAlive[lastIdx]));
        sampled.team.push(sideFromTeam(team[lastIdx]));
        sampled.weapon.push(normalizeWeaponName(weapon[lastIdx]));
        sampled.inventory.push(normalizeInventoryItems(inventory[lastIdx]));
        sampled.armor.push(Math.max(0, Math.round(num(armorValue[lastIdx], 0))));
        sampled.money.push(getMoneyForTick(moneyLookupBySteam, steamId, t));
        sampled.hasHelmet.push(Boolean(hasHelmet[lastIdx]));
        sampled.hasDefuser.push(Boolean(hasDefuser[lastIdx] || hasDefuseKit[lastIdx]));
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (t > totalTicks) {
          totalTicks = t;
        }
      }
    }

    bySteam[steamId] = sampled;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minX = -1000;
    maxX = 1000;
    minY = -1000;
    maxY = 1000;
  }

  return {
    bySteam,
    bounds: { minX: round2(minX), maxX: round2(maxX), minY: round2(minY), maxY: round2(maxY) },
    totalTicks: Math.max(1, Math.round(totalTicks)),
  };
}

function findTrackIndexAtOrBefore(track, targetTick) {
  const ticks = safeArray(track?.tick);
  if (!ticks.length) {
    return -1;
  }
  const target = Math.round(num(targetTick));
  let low = 0;
  let high = ticks.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (num(ticks[mid]) <= target) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function firstKnownTrackSide(track) {
  for (const side of safeArray(track?.team)) {
    const normalized = sideFromTeam(side);
    if (normalized === 'CT' || normalized === 'T') {
      return normalized;
    }
  }
  return '?';
}

function normalizeIdentityName(value) {
  return normalizeTeamDisplayName(value).toLocaleLowerCase();
}

/**
 * Build logical team identities from the starting rosters, then map each round's
 * physical CT/T side back to those identities. This keeps team aggregation stable
 * through halftime and overtime side switches.
 */
function buildStableTeamIdentities(ticksByPlayer, roundsInput) {
  const rounds = safeArray(roundsInput);
  const teamAId = 'TEAM_A';
  const teamBId = 'TEAM_B';
  const firstNamedRound = rounds.find((round) => round?.ctTeamName || round?.tTeamName) || {};
  const playerTeamIds = {};
  const teamAPlayers = [];
  const teamBPlayers = [];
  const firstRound = rounds[0] || {};
  const rosterAnchorTick = Number.isFinite(num(firstRound?.freezeEndTick, NaN))
    ? num(firstRound.freezeEndTick)
    : num(firstRound?.startTick);

  for (const [steamId, track] of Object.entries(ticksByPlayer || {})) {
    const rosterIndex = findTrackIndexAtOrBefore(track, rosterAnchorTick);
    const sideAtRosterAnchor = rosterIndex >= 0 ? sideFromTeam(track?.team?.[rosterIndex]) : '?';
    const startingSide =
      sideAtRosterAnchor === 'CT' || sideAtRosterAnchor === 'T'
        ? sideAtRosterAnchor
        : firstKnownTrackSide(track);
    if (startingSide === 'CT') {
      playerTeamIds[steamId] = teamAId;
      teamAPlayers.push(steamId);
    } else if (startingSide === 'T') {
      playerTeamIds[steamId] = teamBId;
      teamBPlayers.push(steamId);
    }
  }

  const resolveSampledCtTeamId = (round) => {
    const anchorTick = Number.isFinite(num(round?.freezeEndTick, NaN))
      ? num(round.freezeEndTick)
      : num(round?.startTick);
    let teamACt = 0;
    let teamAT = 0;
    let teamBCt = 0;
    let teamBT = 0;
    for (const [steamId, track] of Object.entries(ticksByPlayer || {})) {
      const idx = findTrackIndexAtOrBefore(track, anchorTick);
      if (idx < 0) {
        continue;
      }
      const side = sideFromTeam(track?.team?.[idx]);
      const teamId = playerTeamIds[steamId];
      if (teamId === teamAId && side === 'CT') teamACt += 1;
      if (teamId === teamAId && side === 'T') teamAT += 1;
      if (teamId === teamBId && side === 'CT') teamBCt += 1;
      if (teamId === teamBId && side === 'T') teamBT += 1;
    }
    if (teamACt > teamAT || teamBT > teamBCt) {
      return teamAId;
    }
    if (teamBCt > teamBT || teamAT > teamACt) {
      return teamBId;
    }
    return '';
  };

  const firstNamedCtTeamId = resolveSampledCtTeamId(firstNamedRound) || teamAId;
  const firstCtName = normalizeTeamDisplayName(firstNamedRound.ctTeamName);
  const firstTName = normalizeTeamDisplayName(firstNamedRound.tTeamName);
  const teamAName = (firstNamedCtTeamId === teamAId ? firstCtName : firstTName) || 'Team A';
  const teamBName = (firstNamedCtTeamId === teamBId ? firstCtName : firstTName) || 'Team B';
  const teamANameKey = normalizeIdentityName(teamAName);
  const teamBNameKey = normalizeIdentityName(teamBName);
  let previousCtTeamId = teamAId;
  const mappedRounds = rounds.map((round) => {
    const ctNameKey = normalizeIdentityName(round?.ctTeamName);
    const tNameKey = normalizeIdentityName(round?.tTeamName);
    let ctTeamId = '';

    if (teamANameKey && teamBNameKey && teamANameKey !== teamBNameKey) {
      if (ctNameKey === teamANameKey || tNameKey === teamBNameKey) {
        ctTeamId = teamAId;
      } else if (ctNameKey === teamBNameKey || tNameKey === teamANameKey) {
        ctTeamId = teamBId;
      }
    }

    if (!ctTeamId) {
      ctTeamId = resolveSampledCtTeamId(round);
    }
    if (!ctTeamId) {
      ctTeamId = previousCtTeamId;
    }
    previousCtTeamId = ctTeamId;
    return {
      ...round,
      ctTeamId,
      tTeamId: ctTeamId === teamAId ? teamBId : teamAId,
    };
  });

  return {
    teams: [
      { id: teamAId, name: teamAName, startingSide: 'CT', playerSteamIds: teamAPlayers },
      { id: teamBId, name: teamBName, startingSide: 'T', playerSteamIds: teamBPlayers },
    ],
    playerTeamIds,
    rounds: mappedRounds,
  };
}
/**
 * Build the complete read-only viewer payload for one CS2 demo.
 *
 * @param {{filePath?: string, storedPath?: string, id?: number, title?: string, mapName?: string}} demo
 * @param {{sampleStep?: number, onProgress?: (progress: ParseProgress) => void}} [options]
 * @returns {object}
 */
function buildDemoViewerBundle(demo, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : undefined;
  const warnings = [];
  reportProgress(onProgress, 'validate', 0, 'Validating demo file');

  const filePath = path.resolve(String(demo?.filePath || demo?.storedPath || ''));
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Demo file not found: ${filePath || '(empty path)'}`);
  }
  const sampleStep = Math.max(1, Math.round(num(options.sampleStep, SAMPLE_STEP)));

  reportProgress(onProgress, 'metadata', 0.05, 'Reading demo metadata');
  let header;
  try {
    header = demoparser.parseHeader(filePath);
  } catch (error) {
    throw new Error(`Could not parse the demo header: ${errorMessage(error)}`, { cause: error });
  }
  let playerInfo = [];
  try {
    playerInfo = safeArray(demoparser.parsePlayerInfo(filePath));
  } catch (error) {
    pushWarning(warnings, {
      code: 'player_info_parse_failed',
      stage: 'metadata',
      message: `Player names may be incomplete: ${errorMessage(error)}`,
    });
  }

  let knownEventRows = [];
  try {
    knownEventRows = safeArray(demoparser.listGameEvents(filePath));
  } catch (error) {
    pushWarning(warnings, {
      code: 'event_catalog_parse_failed',
      stage: 'metadata',
      message: `Event catalog unavailable; individual events will still be attempted: ${errorMessage(error)}`,
    });
  }
  const knownEvents = new Set(knownEventRows);
  eventWarningSinks.set(knownEvents, warnings);

  reportProgress(onProgress, 'rounds', 0.12, 'Building round timeline');

  const roundStarts = parseEventSafe(
    filePath,
    knownEvents,
    'round_start',
    [],
    [
      'ct_name',
      't_name',
      'ct_clan_name',
      't_clan_name',
      'ct_team_name',
      't_team_name',
      'team1_name',
      'team2_name',
      'team1_side',
      'team2_side',
    ]
  );
  const roundEnds = parseEventSafe(
    filePath,
    knownEvents,
    'round_end',
    [],
    [
      'ct_name',
      't_name',
      'ct_clan_name',
      't_clan_name',
      'ct_team_name',
      't_team_name',
      'team1_name',
      'team2_name',
      'team1_side',
      'team2_side',
    ]
  );
  const roundFreezeEnds = parseEventSafe(filePath, knownEvents, 'round_freeze_end');

  let rounds = buildRounds(roundStarts, roundEnds, roundFreezeEnds);

  reportProgress(onProgress, 'player-tracks', 0.2, 'Parsing player movement and equipment');
  let rawTicksByPlayer = null;
  try {
    rawTicksByPlayer = demoparser.parseTicks(
      filePath,
      [
        'steamid',
        'team_name',
        'is_alive',
        'X',
        'Y',
        'yaw',
        'health',
        'active_weapon_name',
        'inventory',
        'armor_value',
        'has_helmet',
        'has_defuser',
        'has_defuse_kit',
      ],
      null,
      null,
      true,
      true,
      null
    );
  } catch (error) {
    pushWarning(warnings, {
      code: 'extended_tick_fields_parse_failed',
      stage: 'player-tracks',
      message: `Defuse-kit and helmet state may be incomplete: ${errorMessage(error)}`,
    });
    try {
      rawTicksByPlayer = demoparser.parseTicks(
        filePath,
        ['steamid', 'team_name', 'is_alive', 'X', 'Y', 'yaw', 'health', 'active_weapon_name', 'inventory', 'armor_value'],
        null,
        null,
        true,
        true,
        null
      );
    } catch (fallbackError) {
      throw new Error(`Could not parse player position tracks: ${errorMessage(fallbackError)}`, {
        cause: fallbackError,
      });
    }
  }
  rawTicksByPlayer = enrichRawTicksWithMoney(filePath, rawTicksByPlayer, warnings);

  const tickData = buildTicksByPlayer(rawTicksByPlayer, playerInfo, sampleStep);
  if (!Object.keys(tickData.bySteam).length) {
    throw new Error('Demo contains no usable player position tracks.');
  }
  reportProgress(onProgress, 'player-tracks', 0.46, 'Player tracks ready');
  if (!rounds.length) {
    pushWarning(warnings, {
      code: 'round_events_unavailable',
      stage: 'rounds',
      message: 'Round events were unavailable; the demo is shown as one fallback round.',
    });
    rounds = [
      {
        round: 1,
        startTick: 0,
        freezeEndTick: null,
        endTick: Math.max(1, Number(tickData.totalTicks || 1)),
        winner: '?',
        reason: 'fallback_no_round_events',
        ctTeamName: '',
        tTeamName: '',
      },
    ];
  }
  const derivedTeamNames = deriveTeamNamesFromRounds(rounds);
  const stableTeamData = buildStableTeamIdentities(tickData.bySteam, rounds);
  rounds = stableTeamData.rounds;

  reportProgress(onProgress, 'combat', 0.5, 'Parsing shots, damage, and kills');
  const shots = sortByTick(
    parseEventSafe(filePath, knownEvents, 'weapon_fire', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])
  ).map((row) => ({
    tick: Math.round(num(row.tick)),
    shooterSteamId: String(row.user_steamid || ''),
    shooterName: String(row.user_name || ''),
    shooterTeam: sideFromTeam(row.user_team_name || row.team_name || row.user_team || ''),
    weapon: normalizeWeaponName(row.weapon),
    x: round2(pickCoord(row, 'x', 'user_X', 0)),
    y: round2(pickCoord(row, 'y', 'user_Y', 0)),
    yaw: round2(pickCoord(row, 'yaw', 'user_yaw', 0)),
  }));

  const impacts = sortByTick(
    parseEventSafe(filePath, knownEvents, 'bullet_impact', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])
  ).map((row) => ({
    tick: Math.round(num(row.tick)),
    shooterSteamId: String(row.user_steamid || ''),
    x: round2(pickCoord(row, 'x', 'user_X', 0)),
    y: round2(pickCoord(row, 'y', 'user_Y', 0)),
  }));

  const impactsByShooter = new Map();
  for (const impact of impacts) {
    const sid = String(impact.shooterSteamId || '');
    if (!sid) {
      continue;
    }
    if (!impactsByShooter.has(sid)) {
      impactsByShooter.set(sid, []);
    }
    impactsByShooter.get(sid).push(impact);
  }
  const impactCursors = new Map();
  const hurts = sortByTick(parseEventSafe(filePath, knownEvents, 'player_hurt', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])).map(
    (row) => ({
      tick: Math.round(num(row.tick)),
      attackerSteamId: String(row.attacker_steamid || ''),
      attackerName: String(row.attacker_name || ''),
      victimSteamId: String(row.user_steamid || ''),
      victimName: String(row.user_name || ''),
      weapon: normalizeWeaponName(row.weapon),
      hitgroup: normalizeHitgroup(row.hitgroup),
      headshot: Boolean(row.headshot) || normalizeHitgroup(row.hitgroup) === 'head',
      damageHealth: Math.max(0, Math.round(num(row.dmg_health || row.damage || 0))),
      x: round2(pickCoord(row, 'x', 'user_X', 0)),
      y: round2(pickCoord(row, 'y', 'user_Y', 0)),
    })
  );
  const hurtsByAttacker = new Map();
  for (const hurt of hurts) {
    const sid = String(hurt.attackerSteamId || '');
    if (!sid) {
      continue;
    }
    if (!hurtsByAttacker.has(sid)) {
      hurtsByAttacker.set(sid, []);
    }
    hurtsByAttacker.get(sid).push(hurt);
  }
  const hurtCursors = new Map();
  const tracerWorldLength = 2000;
  const shotsWithImpacts = shots.map((shot) => {
    const sid = String(shot.shooterSteamId || '');
    const list = impactsByShooter.get(sid) || [];
    let cursor = num(impactCursors.get(sid), 0);
    while (cursor < list.length && num(list[cursor].tick) < num(shot.tick) - 1) {
      cursor += 1;
    }
    const windowEnd = num(shot.tick) + 4;
    const impactPoints = [];
    let scan = cursor;
    while (scan < list.length && num(list[scan].tick) <= windowEnd && impactPoints.length < 14) {
      impactPoints.push({
        tick: Math.round(num(list[scan].tick)),
        x: round2(num(list[scan].x)),
        y: round2(num(list[scan].y)),
      });
      scan += 1;
    }
    if (impactPoints.length) {
      cursor = scan;
    }
    impactCursors.set(sid, cursor);

    const hurtList = hurtsByAttacker.get(sid) || [];
    let hurtCursor = num(hurtCursors.get(sid), 0);
    while (hurtCursor < hurtList.length && num(hurtList[hurtCursor].tick) < num(shot.tick) - 1) {
      hurtCursor += 1;
    }
    const hurtWindowEnd = num(shot.tick) + 8;
    let didDamage = false;
    let hurtScan = hurtCursor;
    while (hurtScan < hurtList.length && num(hurtList[hurtScan].tick) <= hurtWindowEnd) {
      didDamage = true;
      hurtScan += 1;
      break;
    }
    hurtCursors.set(sid, didDamage ? hurtScan : hurtCursor);

    let endX = shot.x + Math.cos((num(shot.yaw) * Math.PI) / 180) * tracerWorldLength;
    let endY = shot.y + Math.sin((num(shot.yaw) * Math.PI) / 180) * tracerWorldLength;
    if (impactPoints.length) {
      const last = impactPoints[impactPoints.length - 1];
      endX = num(last.x, endX);
      endY = num(last.y, endY);
    }

    return {
      ...shot,
      endX: round2(endX),
      endY: round2(endY),
      impactPoints,
      penetrations: Math.max(0, impactPoints.length - 1),
      didDamage,
    };
  });

  const kills = sortByTick(parseEventSafe(filePath, knownEvents, 'player_death')).map((row) => {
    const killerSteamId = String(row.attacker_steamid || '');
    const victimSteamId = String(row.user_steamid || '');
    const assisterSteamId = String(row.assister_steamid || '');
    return {
      tick: Math.round(num(row.tick)),
      killerSteamId,
      killerName: String(row.attacker_name || ''),
      killerTeam: sideFromTeam(row.attacker_team_name || row.attacker_team || ''),
      killerTeamId: stableTeamData.playerTeamIds[killerSteamId] || '',
      victimSteamId,
      victimName: String(row.user_name || ''),
      victimTeam: sideFromTeam(row.user_team_name || row.user_team || ''),
      victimTeamId: stableTeamData.playerTeamIds[victimSteamId] || '',
      assisterSteamId,
      assisterName: String(row.assister_name || ''),
      assisterTeam: sideFromTeam(row.assister_team_name || row.assister_team || ''),
      assisterTeamId: stableTeamData.playerTeamIds[assisterSteamId] || '',
      assistedFlash: parseBooleanFlag(row.assistedflash ?? row.assisted_flash),
      weapon: normalizeWeaponName(row.weapon),
      headshot: parseBooleanFlag(row.headshot),
    };
  });

  reportProgress(onProgress, 'utility', 0.64, 'Parsing utility effects and trajectories');
  const infernoStarts = parseEventSafe(filePath, knownEvents, 'inferno_startburn', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']);
  const infernoExpires = parseEventSafe(filePath, knownEvents, 'inferno_expire', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']);
  const infernoExtinguishRows = [
    ...safeArray(parseEventSafe(filePath, knownEvents, 'inferno_extinguish', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...safeArray(parseEventSafe(filePath, knownEvents, 'inferno_extinguished', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
  ];
  const infernoRows = buildInfernoNadeRows(infernoStarts, infernoExpires, infernoExtinguishRows, TICK_RATE * 7);
  const infernoExtinguishNades = sortByTick(infernoExtinguishRows).map((row) => ({
    type: 'inferno_extinguish',
    tick: Math.round(num(row?.tick)),
    endTick: Math.round(num(row?.tick)),
    entityId: Number.isFinite(num(row?.entityid, NaN)) ? Math.round(num(row.entityid)) : null,
    x: round2(pickCoord(row, 'x', 'user_X', 0)),
    y: round2(pickCoord(row, 'y', 'user_Y', 0)),
  }));

  const nades = [
    ...mapNadeRows('flash', parseEventSafe(filePath, knownEvents, 'flashbang_detonate', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']), 14, 90),
    ...mapNadeRows('he', parseEventSafe(filePath, knownEvents, 'hegrenade_detonate', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']), 18, 80),
    ...mapNadeRows('smoke', parseEventSafe(filePath, knownEvents, 'smokegrenade_detonate', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']), TICK_RATE * 20, 140),
    ...infernoRows,
    ...infernoExtinguishNades,
    ...mapNadeRows('decoy', parseEventSafe(filePath, knownEvents, 'decoy_started', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']), TICK_RATE * 10, 75),
  ].sort((a, b) => a.tick - b.tick);

  const blinds = sortByTick(
    parseEventSafe(
      filePath,
      knownEvents,
      'player_blind',
      ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'],
      ['blind_duration', 'flash_duration', 'duration', 'flashtime', 'blindtime', 'm_flFlashDuration']
    )
  ).map((row) => {
    const tick = Math.round(num(row?.tick));
    const durationSec = parseBlindDurationSeconds(row);
    const durationTicks = Math.max(1, Math.round(durationSec * TICK_RATE));
    return {
      tick,
      endTick: tick + durationTicks,
      victimSteamId: String(row?.user_steamid || ''),
      victimName: String(row?.user_name || ''),
      attackerSteamId: String(row?.attacker_steamid || ''),
      attackerName: String(row?.attacker_name || ''),
      durationSec: round2(durationSec),
    };
  });

  const grenadeThrownGeneric = sortByTick(
    parseEventSafe(filePath, knownEvents, 'grenade_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])
  )
    .map((row) => ({
      tick: Math.round(num(row.tick)),
      throwerSteamId: pickActorSteamId(row),
      throwerName: pickActorName(row),
      type: grenadeTypeFromWeapon(row.weapon),
      x: round2(pickCoord(row, 'x', 'user_X', 0)),
      y: round2(pickCoord(row, 'y', 'user_Y', 0)),
    }))
    .filter((row) => row.throwerSteamId && row.type);

  const grenadeThrownTyped = [
    ...mapProjectileRows('flash', parseEventSafe(filePath, knownEvents, 'flashbang_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])),
    ...mapProjectileRows('he', parseEventSafe(filePath, knownEvents, 'hegrenade_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])),
    ...mapProjectileRows('smoke', parseEventSafe(filePath, knownEvents, 'smokegrenade_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])),
    ...mapProjectileRows('decoy', parseEventSafe(filePath, knownEvents, 'decoy_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])),
    ...mapProjectileRows('inferno', parseEventSafe(filePath, knownEvents, 'molotov_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])),
    ...mapProjectileRows('inferno', parseEventSafe(filePath, knownEvents, 'incgrenade_thrown', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z', 'yaw', 'pitch'])),
  ].filter((row) => row.throwerSteamId);

  const grenadeThrown = dedupeUtilityThrows([...grenadeThrownGeneric, ...grenadeThrownTyped])
    .sort((a, b) => a.tick - b.tick || a.throwerSteamId.localeCompare(b.throwerSteamId))
    .filter((row) => Number.isFinite(num(row.x, NaN)) && Number.isFinite(num(row.y, NaN)))
    .map((row) => ({
      ...row,
      throwerTeamId: stableTeamData.playerTeamIds[String(row.throwerSteamId || '')] || '',
    }));

  const grenadeBouncesGeneric = sortByTick(
    parseEventSafe(filePath, knownEvents, 'grenade_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])
  ).map((row) => ({
    tick: Math.round(num(row.tick)),
    throwerSteamId: pickActorSteamId(row),
    throwerName: pickActorName(row),
    type: grenadeTypeFromWeapon(row.weapon),
    x: round2(pickCoord(row, 'x', 'user_X', 0)),
    y: round2(pickCoord(row, 'y', 'user_Y', 0)),
  }));

  const grenadeBouncesTyped = [
    ...mapProjectileRows('flash', parseEventSafe(filePath, knownEvents, 'flashbang_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('he', parseEventSafe(filePath, knownEvents, 'hegrenade_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('smoke', parseEventSafe(filePath, knownEvents, 'smokegrenade_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('decoy', parseEventSafe(filePath, knownEvents, 'decoy_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('inferno', parseEventSafe(filePath, knownEvents, 'molotov_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('inferno', parseEventSafe(filePath, knownEvents, 'incgrenade_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('flash', parseEventSafe(filePath, knownEvents, 'flashbang_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('he', parseEventSafe(filePath, knownEvents, 'hegrenade_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('smoke', parseEventSafe(filePath, knownEvents, 'smokegrenade_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('decoy', parseEventSafe(filePath, knownEvents, 'decoy_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('inferno', parseEventSafe(filePath, knownEvents, 'molotov_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('inferno', parseEventSafe(filePath, knownEvents, 'incgrenade_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
    ...mapProjectileRows('', parseEventSafe(filePath, knownEvents, 'grenade_projectile_bounce', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])),
  ];

  const grenadeBounces = dedupeProjectileRows([...grenadeBouncesGeneric, ...grenadeBouncesTyped])
    .filter((row) => row.throwerSteamId)
    .sort((a, b) => a.tick - b.tick || a.throwerSteamId.localeCompare(b.throwerSteamId));

  let projectiles = [];
  let grenadeTickRows = [];
  try {
    grenadeTickRows = safeArray(demoparser.parseGrenades(filePath, null, false));
  } catch (error) {
    pushWarning(warnings, {
      code: 'grenade_tick_parse_failed',
      stage: 'utility',
      message: `Utility trajectories were reconstructed from events: ${errorMessage(error)}`,
    });
    grenadeTickRows = [];
  }
  if (grenadeTickRows.length) {
    projectiles = buildGrenadeProjectilesFromTickRows(grenadeTickRows, rounds);
  }
  if (!projectiles.length) {
    projectiles = buildGrenadeProjectiles(grenadeThrown, grenadeBounces, nades, rounds);
  }

  reportProgress(onProgress, 'objectives', 0.82, 'Parsing bomb and door events');
  const doors = [
    ...safeArray(parseEventSafe(filePath, knownEvents, 'door_moving', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])).map((row) => ({
      type: 'door_moving',
      tick: Math.round(num(row.tick)),
      x: round2(pickCoord(row, 'x', 'user_X', 0)),
      y: round2(pickCoord(row, 'y', 'user_Y', 0)),
    })),
    ...safeArray(parseEventSafe(filePath, knownEvents, 'door_open', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])).map((row) => ({
      type: 'door_open',
      tick: Math.round(num(row.tick)),
      x: round2(pickCoord(row, 'x', 'user_X', 0)),
      y: round2(pickCoord(row, 'y', 'user_Y', 0)),
    })),
  ].sort((a, b) => a.tick - b.tick);

  const sourceMtimeMs = fs.statSync(filePath).mtimeMs;

  const getPlayerStateAtTick = (steamId, tick) => {
    const sid = String(steamId || '');
    const targetTick = Math.round(num(tick));
    if (!sid) {
      return null;
    }
    const track = tickData?.bySteam?.[sid];
    if (!track) {
      return null;
    }
    const ticks = safeArray(track.tick);
    if (!ticks.length) {
      return null;
    }
    let idx = -1;
    for (let i = 0; i < ticks.length; i += 1) {
      const t = Math.round(num(ticks[i]));
      if (t > targetTick) {
        break;
      }
      idx = i;
    }
    if (idx < 0) {
      return null;
    }
    return {
      hasDefuser: Boolean(track?.hasDefuser?.[idx]),
      x: round2(num(track?.x?.[idx])),
      y: round2(num(track?.y?.[idx])),
    };
  };

  const clampEventTickToRound = (tick, roundStart, roundEnd) => {
    const t = Math.round(num(tick));
    if (Number.isFinite(num(roundStart, NaN)) && Number.isFinite(num(roundEnd, NaN))) {
      return Math.max(Math.round(num(roundStart)), Math.min(Math.round(num(roundEnd)), t));
    }
    return Math.max(0, t);
  };

  const findRoundForTick = (targetTick) => {
    const tick = Math.round(num(targetTick));
    const rows = safeArray(rounds);
    for (let i = 0; i < rows.length; i += 1) {
      const round = rows[i];
      const startTick = Math.round(num(round?.startTick));
      const endTick = Math.round(num(round?.endTick, startTick));
      if (tick >= startTick && tick <= endTick) {
        return round;
      }
    }
    return null;
  };

  const plantedRows = safeArray(
    parseEventSafe(
      filePath,
      knownEvents,
      'bomb_planted',
      ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'],
      ['site', 'bomb_site', 'site_id', 'siteid', 'bombsite', 'place_name', 'site_name']
    )
  );

  const defusedRows = safeArray(parseEventSafe(filePath, knownEvents, 'bomb_defused', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']));
  const beginDefuseRows = safeArray(parseEventSafe(filePath, knownEvents, 'bomb_begindefuse', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z']));

  const syntheticPlantStarts = plantedRows.map((row) => {
    const plantedTick = Math.round(num(row.tick));
    const round = findRoundForTick(plantedTick);
    const startTick = clampEventTickToRound(plantedTick - Math.round(TICK_RATE * 3.2), round?.startTick, round?.endTick);
    return {
      type: 'plant_start',
      tick: startTick,
      playerSteamId: String(row.user_steamid || ''),
      playerName: String(row.user_name || ''),
      site: inferBombSiteFromRow(row),
      x: round2(pickCoord(row, 'x', 'user_X', 0)),
      y: round2(pickCoord(row, 'y', 'user_Y', 0)),
    };
  });

  const actualDefuseStarts = beginDefuseRows.map((row) => ({
    type: 'defuse_start',
    tick: Math.round(num(row.tick)),
    playerSteamId: String(row.user_steamid || ''),
    playerName: String(row.user_name || ''),
    x: round2(pickCoord(row, 'x', 'user_X', 0)),
    y: round2(pickCoord(row, 'y', 'user_Y', 0)),
  }));

  const syntheticDefuseStarts = defusedRows.map((row) => {
    const defusedTick = Math.round(num(row.tick));
    const sid = String(row.user_steamid || '');
    const playerAtDefuse = getPlayerStateAtTick(sid, defusedTick);
    const hasKit = Boolean(playerAtDefuse?.hasDefuser);
    const durationTicks = Math.round(TICK_RATE * (hasKit ? 5 : 10));
    const round = findRoundForTick(defusedTick);
    const startTick = clampEventTickToRound(defusedTick - durationTicks, round?.startTick, round?.endTick);
    return {
      type: 'defuse_start',
      tick: startTick,
      playerSteamId: sid,
      playerName: String(row.user_name || ''),
      x: round2(num(playerAtDefuse?.x, pickCoord(row, 'x', 'user_X', 0))),
      y: round2(num(playerAtDefuse?.y, pickCoord(row, 'y', 'user_Y', 0))),
      synthetic: true,
    };
  });

  const defuseStartByDefuserRound = new Map();
  for (const row of actualDefuseStarts) {
    const sid = String(row.playerSteamId || '');
    const tick = Math.round(num(row.tick));
    const round = findRoundForTick(tick);
    const key = `${sid}|${Math.round(num(round?.startTick, -1))}`;
    if (!sid) {
      continue;
    }
    const prev = defuseStartByDefuserRound.get(key);
    if (!prev || tick < Math.round(num(prev.tick))) {
      defuseStartByDefuserRound.set(key, row);
    }
  }

  const dedupedSyntheticDefuseStarts = syntheticDefuseStarts.filter((row) => {
    const sid = String(row.playerSteamId || '');
    if (!sid) {
      return false;
    }
    const tick = Math.round(num(row.tick));
    const round = findRoundForTick(tick);
    const key = `${sid}|${Math.round(num(round?.startTick, -1))}`;
    const existing = defuseStartByDefuserRound.get(key);
    if (!existing) {
      return true;
    }
    const delta = Math.abs(Math.round(num(existing.tick)) - tick);
    return delta > Math.round(TICK_RATE * 1.5);
  });

  reportProgress(onProgress, 'finalize', 0.94, 'Finalizing viewer bundle');
  const bundle = {
    meta: {
      viewerVersion: VIEWER_VERSION,
      schemaVersion: VIEWER_SCHEMA,
      parserVersion: PARSER_VERSION,
      sourceMtimeMs: round2(sourceMtimeMs),
      demoId: Number(demo?.id || 0),
      title: String(demo?.title || path.basename(filePath)),
      mapName: String(demo?.mapName || header?.map_name || ''),
      sampleStep,
      tickRate: TICK_RATE,
      totalTicks: tickData.totalTicks,
      durationSeconds: round2(tickData.totalTicks / TICK_RATE),
      teamNames: {
        ct: derivedTeamNames.ct || '',
        t: derivedTeamNames.t || '',
      },
      generatedAt: new Date().toISOString(),
      warnings,
    },
    warnings,
    bounds: tickData.bounds,
    teams: stableTeamData.teams,
    players: Object.values(tickData.bySteam).map((row) => ({
      steamId: row.steamId,
      name: row.name,
      teamId: stableTeamData.playerTeamIds[row.steamId] || '',
    })),
    rounds,
    tracks: {
      ticksByPlayer: tickData.bySteam,
      shots: shotsWithImpacts,
      impacts,
      hurts,
      blinds,
      kills,
      utilityThrows: grenadeThrown,
      nades,
      projectiles,
      bombs: [
        ...syntheticPlantStarts,
        ...plantedRows.map((row) => ({
          type: 'planted',
          tick: Math.round(num(row.tick)),
          playerSteamId: String(row.user_steamid || ''),
          playerName: String(row.user_name || ''),
          site: inferBombSiteFromRow(row),
          x: round2(pickCoord(row, 'x', 'user_X', 0)),
          y: round2(pickCoord(row, 'y', 'user_Y', 0)),
        })),
        ...actualDefuseStarts,
        ...dedupedSyntheticDefuseStarts,
        ...defusedRows.map((row) => ({
          type: 'defused',
          tick: Math.round(num(row.tick)),
          playerSteamId: String(row.user_steamid || ''),
          playerName: String(row.user_name || ''),
          x: round2(pickCoord(row, 'x', 'user_X', 0)),
          y: round2(pickCoord(row, 'y', 'user_Y', 0)),
        })),
        ...safeArray(parseEventSafe(filePath, knownEvents, 'bomb_exploded', ['steamid', 'name', 'team_name', 'X', 'Y', 'Z'])).map((row) => ({
          type: 'exploded',
          tick: Math.round(num(row.tick)),
          playerSteamId: String(row.user_steamid || ''),
          playerName: String(row.user_name || ''),
          x: round2(pickCoord(row, 'x', 'user_X', 0)),
          y: round2(pickCoord(row, 'y', 'user_Y', 0)),
        })),
      ].sort((a, b) => Math.round(num(a?.tick)) - Math.round(num(b?.tick))),
      doors,
    },
  };

  reportProgress(onProgress, 'complete', 1, 'Viewer bundle ready');
  return bundle;
}

module.exports = {
  TICK_RATE,
  SAMPLE_STEP,
  VIEWER_SCHEMA,
  VIEWER_VERSION,
  PARSER_VERSION,
  buildDemoViewerBundle,
  buildGrenadeProjectiles,
  buildGrenadeProjectilesFromTickRows,
  buildInfernoNadeRows,
  buildRounds,
  buildStableTeamIdentities,
  buildTicksByPlayer,
  dedupeProjectileRows,
  dedupeUtilityThrows,
  inferBombSiteFromRow,
  normalizeWeaponName,
  parseBooleanFlag,
  parseEventSafe,
  reportProgress,
  sideFromTeam,
};
