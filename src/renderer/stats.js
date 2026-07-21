// @ts-check

/** @typedef {Record<string, any>} AnyRecord */

const SIDE_CT = 'CT';
const SIDE_T = 'T';
const SIDE_UNKNOWN = '?';
const DEFAULT_TEAM_IDS = ['TEAM_A', 'TEAM_B'];

const FIREARM_KEYS = new Set([
  'ak47',
  'aug',
  'awp',
  'bizon',
  'cz',
  'cz75',
  'cz75a',
  'deagle',
  'deserteagle',
  'dualberettas',
  'dualeites',
  'dualelites',
  'elite',
  'famas',
  'fiveseven',
  'g3sg1',
  'galil',
  'galilar',
  'glock',
  'hkp2000',
  'krieg552',
  'm249',
  'm4a1',
  'm4a1s',
  'm4a1silencer',
  'm4a4',
  'mac10',
  'mag7',
  'mp5',
  'mp5sd',
  'mp7',
  'mp9',
  'negev',
  'nova',
  'p2000',
  'p250',
  'p90',
  'revolver',
  'r8',
  'sawedoff',
  'scar20',
  'scout',
  'sg553',
  'sg556',
  'ssg08',
  'tec9',
  'ump',
  'ump45',
  'usp',
  'usps',
  'uspsilencer',
  'xm1014',
]);

const UTILITY_PRICES = Object.freeze({
  flash: 200,
  he: 300,
  smoke: 300,
  infernoT: 400,
  infernoCT: 500,
  decoy: 50,
});

/** @param {unknown} value @returns {AnyRecord[]} */
function recordArray(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

/** @param {unknown} value @returns {any[]} */
function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} value @param {number} [fallback] @returns {number} */
function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** @param {unknown} value @returns {string} */
export function normalizePlayerId(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const id = String(value).trim();
  return id === '0' || id.toLowerCase() === 'null' || id.toLowerCase() === 'undefined' ? '' : id;
}

/** @param {unknown} value @returns {'CT'|'T'|'?'} */
export function normalizeSide(value) {
  if (value === 3 || String(value).trim() === '3') {
    return SIDE_CT;
  }
  if (value === 2 || String(value).trim() === '2') {
    return SIDE_T;
  }
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (normalized === 'CT' || normalized === 'COUNTERTERRORIST' || normalized === 'COUNTERTERRORISTS') {
    return SIDE_CT;
  }
  if (normalized === 'T' || normalized === 'TERRORIST' || normalized === 'TERRORISTS') {
    return SIDE_T;
  }
  return SIDE_UNKNOWN;
}

/** @param {unknown} value @returns {string} */
export function normalizeWeapon(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^weapon[_\s-]*/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** @param {unknown} value @returns {boolean} */
export function isFirearmWeapon(value) {
  return FIREARM_KEYS.has(normalizeWeapon(value));
}

/** @param {unknown} value @returns {'flash'|'he'|'smoke'|'inferno'|'decoy'|null} */
export function normalizeUtilityType(value) {
  const key = normalizeWeapon(value);
  if (key === 'flash' || key === 'flashbang') {
    return 'flash';
  }
  if (key === 'he' || key === 'hegrenade' || key === 'fraggrenade') {
    return 'he';
  }
  if (key === 'smoke' || key === 'smokegrenade') {
    return 'smoke';
  }
  if (key === 'inferno' || key === 'fire' || key === 'molotov' || key === 'incendiary' || key === 'incgrenade') {
    return 'inferno';
  }
  if (key === 'decoy' || key === 'decoygrenade') {
    return 'decoy';
  }
  return null;
}

/** @param {AnyRecord} row @param {string[]} keys @returns {string} */
function firstId(row, keys) {
  for (const key of keys) {
    const id = normalizePlayerId(row?.[key]);
    if (id) {
      return id;
    }
  }
  return '';
}

/** @param {AnyRecord} row @param {string[]} keys @returns {string} */
function firstText(row, keys) {
  for (const key of keys) {
    const text = String(row?.[key] ?? '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

/** @param {AnyRecord} bundle @returns {AnyRecord} */
function tracksOf(bundle) {
  const tracks = bundle?.tracks;
  return tracks && typeof tracks === 'object' ? tracks : {};
}

/** @param {AnyRecord} bundle @returns {Record<string, AnyRecord>} */
function tickTracksOf(bundle) {
  const value = tracksOf(bundle).ticksByPlayer;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** @param {AnyRecord} track @returns {number[]} */
function trackTicks(track) {
  return safeArray(track?.tick ?? track?.ticks).map((tick) => finiteNumber(tick));
}

/** @param {number[]} values @param {number} target @returns {number} */
function floorIndex(values, target) {
  let low = 0;
  let high = values.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (finiteNumber(values[mid]) <= target) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/** @param {AnyRecord} track @param {string[]} keys @param {number} index @returns {any} */
function trackValue(track, keys, index) {
  for (const key of keys) {
    const values = safeArray(track?.[key]);
    if (index >= 0 && index < values.length) {
      return values[index];
    }
  }
  return undefined;
}

/**
 * Return the sampled state at or immediately before a tick.
 *
 * @param {AnyRecord} bundle
 * @param {unknown} playerId
 * @param {number} tick
 * @returns {{tick:number, side:'CT'|'T'|'?', isAlive:boolean|null, health:number|null, inventory:any[], index:number}|null}
 */
export function getPlayerStateAtTick(bundle, playerId, tick) {
  const id = normalizePlayerId(playerId);
  const track = tickTracksOf(bundle)[id];
  if (!track) {
    return null;
  }
  const ticks = trackTicks(track);
  const index = floorIndex(ticks, finiteNumber(tick));
  if (index < 0) {
    return null;
  }
  const aliveValue = trackValue(track, ['isAlive', 'alive', 'is_alive'], index);
  const healthValue = trackValue(track, ['health', 'hp'], index);
  return {
    tick: finiteNumber(ticks[index]),
    side: normalizeSide(trackValue(track, ['team', 'side', 'teamName'], index)),
    isAlive: aliveValue === undefined || aliveValue === null ? null : Boolean(aliveValue),
    health: healthValue === undefined || healthValue === null ? null : finiteNumber(healthValue),
    inventory: safeArray(trackValue(track, ['inventory', 'weapons'], index)),
    index,
  };
}

/** @param {AnyRecord} bundle @returns {number} */
export function getFinalTick(bundle) {
  let maximum = Math.max(0, finiteNumber(bundle?.meta?.totalTicks, 0));
  for (const round of recordArray(bundle?.rounds)) {
    maximum = Math.max(maximum, finiteNumber(round.startTick), finiteNumber(round.endTick), finiteNumber(round.freezeEndTick));
  }
  for (const track of Object.values(tickTracksOf(bundle))) {
    for (const tick of trackTicks(track)) {
      maximum = Math.max(maximum, tick);
    }
  }
  for (const value of Object.values(tracksOf(bundle))) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const row of recordArray(value)) {
      maximum = Math.max(maximum, finiteNumber(row.tick), finiteNumber(row.endTick));
    }
  }
  return Math.max(0, Math.round(maximum));
}

/** @param {AnyRecord} bundle @param {number} finalTick @returns {AnyRecord[]} */
function normalizedRounds(bundle, finalTick) {
  const rounds = recordArray(bundle?.rounds)
    .map((round, index) => {
      const startTick = Math.max(0, Math.round(finiteNumber(round.startTick)));
      const endTick = Math.max(startTick, Math.round(finiteNumber(round.endTick, startTick)));
      return { ...round, index, startTick, endTick };
    })
    .sort((left, right) => left.startTick - right.startTick || left.endTick - right.endTick || left.index - right.index);
  if (rounds.length) {
    return rounds;
  }
  const hasMatchData = finalTick > 0 || recordArray(bundle?.players).length > 0;
  return hasMatchData
    ? [{ index: 0, round: 1, startTick: 0, endTick: Math.max(0, finalTick), winner: SIDE_UNKNOWN, reason: 'stats_fallback' }]
    : [];
}

/** @param {AnyRecord[]} rounds @param {number} tick @returns {AnyRecord|null} */
function roundAtTick(rounds, tick) {
  let previous = null;
  for (const round of rounds) {
    if (tick >= round.startTick && tick <= round.endTick) {
      return round;
    }
    if (round.startTick <= tick) {
      previous = round;
    } else {
      break;
    }
  }
  return previous;
}

/** @param {AnyRecord} round @returns {number} */
function roundProbeTick(round) {
  const preferred = finiteNumber(round.freezeEndTick, Number.NaN);
  if (Number.isFinite(preferred) && preferred >= round.startTick && preferred <= round.endTick) {
    return preferred;
  }
  return round.startTick + Math.max(0, Math.floor((round.endTick - round.startTick) / 2));
}

/** @param {AnyRecord} bundle @returns {Map<string, AnyRecord>} */
function collectPlayerDirectory(bundle) {
  const directory = new Map();
  /** @param {unknown} idValue @param {unknown} nameValue @param {AnyRecord} [source] */
  const add = (idValue, nameValue, source = {}) => {
    const id = normalizePlayerId(idValue);
    if (!id) {
      return;
    }
    const previous = directory.get(id) || {};
    const name = String(nameValue ?? '').trim() || previous.name || id;
    directory.set(id, { ...previous, ...source, steamId: id, name });
  };

  for (const player of recordArray(bundle?.players)) {
    add(player.steamId ?? player.steamid ?? player.id, player.name ?? player.playerName, player);
  }
  for (const [id, track] of Object.entries(tickTracksOf(bundle))) {
    add(id, track.name ?? track.playerName, track);
  }

  const tracks = tracksOf(bundle);
  for (const row of recordArray(tracks.shots)) {
    add(firstId(row, ['shooterSteamId', 'shooterId', 'steamId']), firstText(row, ['shooterName', 'name']));
  }
  for (const row of recordArray(tracks.hurts)) {
    add(firstId(row, ['attackerSteamId', 'attackerId']), firstText(row, ['attackerName']));
    add(firstId(row, ['victimSteamId', 'victimId', 'userSteamId']), firstText(row, ['victimName', 'userName']));
  }
  for (const row of recordArray(tracks.blinds)) {
    add(firstId(row, ['attackerSteamId', 'attackerId']), firstText(row, ['attackerName']));
    add(firstId(row, ['victimSteamId', 'victimId', 'userSteamId']), firstText(row, ['victimName', 'userName']));
  }
  for (const row of recordArray(tracks.kills)) {
    add(firstId(row, ['killerSteamId', 'attackerSteamId', 'killerId']), firstText(row, ['killerName', 'attackerName']));
    add(firstId(row, ['victimSteamId', 'userSteamId', 'victimId']), firstText(row, ['victimName', 'userName']));
    add(firstId(row, ['assisterSteamId', 'assistantSteamId', 'assisterId']), firstText(row, ['assisterName', 'assistantName']));
    add(firstId(row, ['flashAssisterSteamId', 'flashbangAssisterSteamId']), firstText(row, ['flashAssisterName']));
  }
  for (const row of [...recordArray(tracks.utilityThrows), ...recordArray(tracks.nades)]) {
    add(firstId(row, ['throwerSteamId', 'playerSteamId', 'steamId']), firstText(row, ['throwerName', 'playerName', 'name']));
  }
  for (const row of recordArray(tracks.bombs)) {
    add(firstId(row, ['playerSteamId', 'steamId']), firstText(row, ['playerName', 'name']));
  }
  return directory;
}

/** @param {AnyRecord} left @param {AnyRecord} right @returns {1|-1|0} */
function compareTrackTeams(left, right) {
  const leftTicks = trackTicks(left);
  const rightTicks = trackTicks(right);
  if (!leftTicks.length || !rightTicks.length) {
    return 0;
  }
  const start = Math.max(leftTicks[0], rightTicks[0]);
  const end = Math.min(leftTicks[leftTicks.length - 1], rightTicks[rightTicks.length - 1]);
  if (start > end) {
    return 0;
  }
  const candidateTicks = leftTicks.filter((tick) => tick >= start && tick <= end);
  const stride = Math.max(1, Math.floor(candidateTicks.length / 16));
  let same = 0;
  let opposite = 0;
  const leftSides = safeArray(left.team ?? left.side ?? left.teamName);
  const rightSides = safeArray(right.team ?? right.side ?? right.teamName);
  for (let index = 0; index < candidateTicks.length; index += stride) {
    const tick = candidateTicks[index];
    const leftIndex = floorIndex(leftTicks, tick);
    const rightIndex = floorIndex(rightTicks, tick);
    const leftSide = normalizeSide(leftSides[leftIndex]);
    const rightSide = normalizeSide(rightSides[rightIndex]);
    if (leftSide === SIDE_UNKNOWN || rightSide === SIDE_UNKNOWN) {
      continue;
    }
    if (leftSide === rightSide) {
      same += 1;
    } else {
      opposite += 1;
    }
  }
  return same === opposite ? 0 : same > opposite ? 1 : -1;
}

/** @param {unknown} value @returns {boolean} */
function usefulTeamName(value) {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return Boolean(key) && !['ct', 't', 'counterterrorist', 'counterterrorists', 'terrorist', 'terrorists', 'teama', 'teamb', 'unknown'].includes(key);
}

/** @param {Map<string, Map<string, number>>} votes @param {string} teamId @param {unknown} nameValue @param {number} [weight] */
function addTeamNameVote(votes, teamId, nameValue, weight = 1) {
  const name = String(nameValue ?? '').trim();
  if (!teamId || !name) {
    return;
  }
  if (!votes.has(teamId)) {
    votes.set(teamId, new Map());
  }
  const bucket = votes.get(teamId);
  bucket.set(name, finiteNumber(bucket.get(name)) + weight + (usefulTeamName(name) ? 1000 : 0));
}

/**
 * Resolve stable logical team identities. Explicit viewer-v1 IDs win; older
 * bundles fall back to roster relationships across sampled side switches.
 *
 * @param {AnyRecord} bundle
 * @returns {{teams:Array<{id:string,name:string,startingSide:'CT'|'T'|'?',memberIds:string[]}>, teamByPlayer:Record<string,string>}}
 */
export function inferLogicalTeams(bundle) {
  const directory = collectPlayerDirectory(bundle);
  const ticksByPlayer = tickTracksOf(bundle);
  const rounds = normalizedRounds(bundle, getFinalTick(bundle));
  const explicitTeams = recordArray(bundle?.teams);
  /** @type {string[]} */
  const teamIds = [];
  /** @type {Map<string, AnyRecord>} */
  const infoById = new Map();
  /** @type {Map<string, string>} */
  const assignments = new Map();
  /** @param {unknown} idValue @param {AnyRecord} [info] @returns {string} */
  const addTeam = (idValue, info = {}) => {
    const id = String(idValue ?? '').trim();
    if (!id || normalizeSide(id) !== SIDE_UNKNOWN) {
      return '';
    }
    if (!teamIds.includes(id)) {
      teamIds.push(id);
    }
    infoById.set(id, { ...(infoById.get(id) || {}), ...info, id });
    return id;
  };

  for (const team of explicitTeams) {
    const id = addTeam(team.id ?? team.teamId, team);
    if (!id) {
      continue;
    }
    const roster = safeArray(team.playerSteamIds ?? team.playerIds ?? team.members ?? team.players);
    for (const member of roster) {
      const playerId = normalizePlayerId(member?.steamId ?? member?.id ?? member);
      if (playerId) {
        assignments.set(playerId, id);
      }
    }
  }
  for (const round of rounds) {
    addTeam(round.ctTeamId);
    addTeam(round.tTeamId);
  }
  for (const [id, player] of directory) {
    const explicitId = addTeam(player.teamId ?? player.logicalTeamId);
    if (explicitId) {
      assignments.set(id, explicitId);
    }
  }

  if (!teamIds.length) {
    addTeam(DEFAULT_TEAM_IDS[0], { startingSide: SIDE_CT });
    addTeam(DEFAULT_TEAM_IDS[1], { startingSide: SIDE_T });
  } else if (teamIds.length === 1) {
    addTeam(teamIds[0] === DEFAULT_TEAM_IDS[0] ? DEFAULT_TEAM_IDS[1] : DEFAULT_TEAM_IDS[0]);
  }

  // Explicit per-round side identities can recover a missing player.teamId.
  for (const [playerId] of directory) {
    if (assignments.has(playerId)) {
      continue;
    }
    const votes = new Map();
    for (const round of rounds) {
      const state = getPlayerStateAtTick(bundle, playerId, roundProbeTick(round));
      const candidate = state?.side === SIDE_CT ? String(round.ctTeamId ?? '') : state?.side === SIDE_T ? String(round.tTeamId ?? '') : '';
      if (candidate && teamIds.includes(candidate)) {
        votes.set(candidate, finiteNumber(votes.get(candidate)) + 1);
      }
    }
    const best = [...votes].sort((left, right) => right[1] - left[1])[0];
    if (best) {
      assignments.set(playerId, best[0]);
    }
  }

  // Older bundles: propagate same/opposite roster relationships through all
  // overlapping samples, so halftime and overtime side swaps do not re-label.
  const playerIds = [...directory.keys()];
  if (!assignments.size) {
    const anchor = playerIds
      .filter((id) => trackTicks(ticksByPlayer[id] || {}).length)
      .sort((left, right) => trackTicks(ticksByPlayer[left])[0] - trackTicks(ticksByPlayer[right])[0])[0];
    if (anchor) {
      assignments.set(anchor, teamIds[0]);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const playerId of playerIds) {
      if (assignments.has(playerId) || !ticksByPlayer[playerId]) {
        continue;
      }
      const votes = new Map();
      for (const [knownId, knownTeam] of assignments) {
        if (!ticksByPlayer[knownId]) {
          continue;
        }
        const relation = compareTrackTeams(ticksByPlayer[playerId], ticksByPlayer[knownId]);
        if (!relation) {
          continue;
        }
        const predicted = relation === 1 ? knownTeam : teamIds.find((id) => id !== knownTeam) || teamIds[0];
        votes.set(predicted, finiteNumber(votes.get(predicted)) + 1);
      }
      const best = [...votes].sort((left, right) => right[1] - left[1])[0];
      if (best) {
        assignments.set(playerId, best[0]);
        changed = true;
      }
    }
  }

  // Last-resort first-side mapping is deterministic for partial old bundles.
  let baselineCtTeam = '';
  let baselineTTeam = '';
  for (const [playerId, teamId] of assignments) {
    const ticks = trackTicks(ticksByPlayer[playerId] || {});
    if (!ticks.length) {
      continue;
    }
    const side = getPlayerStateAtTick(bundle, playerId, ticks[0])?.side;
    if (side === SIDE_CT && !baselineCtTeam) baselineCtTeam = teamId;
    if (side === SIDE_T && !baselineTTeam) baselineTTeam = teamId;
  }
  baselineCtTeam ||= teamIds[0];
  baselineTTeam ||= teamIds.find((id) => id !== baselineCtTeam) || teamIds[1] || teamIds[0];
  for (const playerId of playerIds) {
    if (assignments.has(playerId)) {
      continue;
    }
    const ticks = trackTicks(ticksByPlayer[playerId] || {});
    const side = ticks.length ? getPlayerStateAtTick(bundle, playerId, ticks[0])?.side : SIDE_UNKNOWN;
    if (side === SIDE_CT) assignments.set(playerId, baselineCtTeam);
    if (side === SIDE_T) assignments.set(playerId, baselineTTeam);
  }

  const nameVotes = new Map();
  for (const teamId of teamIds) {
    const info = infoById.get(teamId) || {};
    addTeamNameVote(nameVotes, teamId, info.name ?? info.label, 10000);
  }
  for (const round of rounds) {
    if (round.ctTeamId) addTeamNameVote(nameVotes, String(round.ctTeamId), round.ctTeamName);
    if (round.tTeamId) addTeamNameVote(nameVotes, String(round.tTeamId), round.tTeamName);
    if (!round.ctTeamId || !round.tTeamId) {
      for (const teamId of teamIds) {
        const member = [...assignments].find(([, assigned]) => assigned === teamId)?.[0];
        const side = member ? getPlayerStateAtTick(bundle, member, roundProbeTick(round))?.side : SIDE_UNKNOWN;
        if (side === SIDE_CT) addTeamNameVote(nameVotes, teamId, round.ctTeamName);
        if (side === SIDE_T) addTeamNameVote(nameVotes, teamId, round.tTeamName);
      }
    }
  }
  const metaTeamNames = bundle?.meta?.teamNames || {};
  addTeamNameVote(nameVotes, baselineCtTeam, metaTeamNames.ct);
  addTeamNameVote(nameVotes, baselineTTeam, metaTeamNames.t);

  const teams = teamIds.map((id, index) => {
    const info = infoById.get(id) || {};
    const winningName = [...(nameVotes.get(id) || new Map())].sort((left, right) => right[1] - left[1])[0]?.[0];
    let startingSide = normalizeSide(info.startingSide);
    if (startingSide === SIDE_UNKNOWN) {
      if (id === baselineCtTeam) startingSide = SIDE_CT;
      if (id === baselineTTeam) startingSide = SIDE_T;
    }
    return {
      id,
      name: winningName || `Team ${String.fromCharCode(65 + index)}`,
      startingSide,
      memberIds: [...assignments].filter(([, assigned]) => assigned === id).map(([playerId]) => playerId),
    };
  });
  return { teams, teamByPlayer: Object.fromEntries(assignments) };
}

/** @param {string} first @param {string} second @param {number} tick @param {AnyRecord} bundle @param {Record<string,string>} teamByPlayer @param {string} [firstExplicitTeam] @param {string} [secondExplicitTeam] @returns {boolean} */
function areEnemies(first, second, tick, bundle, teamByPlayer, firstExplicitTeam = '', secondExplicitTeam = '') {
  if (!first || !second || first === second) {
    return false;
  }
  const firstTeam = firstExplicitTeam || teamByPlayer[first] || '';
  const secondTeam = secondExplicitTeam || teamByPlayer[second] || '';
  if (firstTeam && secondTeam) {
    return firstTeam !== secondTeam;
  }
  const firstSide = getPlayerStateAtTick(bundle, first, tick)?.side;
  const secondSide = getPlayerStateAtTick(bundle, second, tick)?.side;
  if (firstSide && secondSide && firstSide !== SIDE_UNKNOWN && secondSide !== SIDE_UNKNOWN) {
    return firstSide !== secondSide;
  }
  // Distinct players are treated as opponents only when the bundle lacks any
  // team evidence. viewer-v1 normally never reaches this fallback.
  return true;
}

/** @param {AnyRecord} bundle @param {AnyRecord} player @param {AnyRecord} round @param {number} cutoff @returns {boolean} */
function participatesInRound(bundle, player, round, cutoff) {
  const id = normalizePlayerId(player.steamId);
  const track = tickTracksOf(bundle)[id];
  if (!track) {
    return true;
  }
  const ticks = trackTicks(track);
  if (!ticks.length) {
    return false;
  }
  const visibleEnd = Math.min(round.endTick, cutoff);
  return ticks[0] <= visibleEnd && ticks[ticks.length - 1] >= round.startTick;
}

/** @returns {AnyRecord} */
function makeRawStats() {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    flashAssists: 0,
    totalDamage: 0,
    damageReceived: 0,
    assistDamage: 0,
    headshotKills: 0,
    totalKills: 0,
    nonAwpKills: 0,
    nonAwpHeadshotKills: 0,
    heDamage: 0,
    molotovDamage: 0,
    enemiesFlashed: 0,
    shotsFired: 0,
    shotsHit: 0,
    bombsPlanted: 0,
    bombsDefused: 0,
    roundsSurvivedCount: 0,
    kastRounds: 0,
    utility: {
      throws: { flashbang: 0, heGrenade: 0, smoke: 0, molotovIncendiary: 0, decoy: 0 },
      flashesWithNoEnemyBlind: 0,
      flashConversions: 0,
      totalBlindSeconds: 0,
      teamFlashes: 0,
      utilityKills: 0,
      utilityDamageTotal: 0,
      teamUtilityDamage: 0,
      teamDamageWhileTeamFlashed: 0,
      totalUnusedUtilityValue: 0,
    },
  };
}

/** @param {AnyRecord} raw @param {number} roundsStarted @param {number} roundsCompleted @returns {AnyRecord} */
function finalizeStats(raw, roundsStarted, roundsCompleted) {
  const throws = raw.utility.throws;
  const totalThrows = throws.flashbang + throws.heGrenade + throws.smoke + throws.molotovIncendiary + throws.decoy;
  const divide = (value, denominator) => (denominator > 0 ? value / denominator : 0);
  const kd = raw.deaths > 0 ? raw.kills / raw.deaths : raw.kills;
  const adr = divide(raw.totalDamage, roundsStarted);
  const headshotPercent = divide(raw.headshotKills * 100, raw.totalKills);
  const headshotPercentExcludingAwp = divide(raw.nonAwpHeadshotKills * 100, raw.nonAwpKills);
  const accuracy = divide(raw.shotsHit * 100, raw.shotsFired);
  const roundsSurvivedPercent = divide(raw.roundsSurvivedCount * 100, roundsCompleted);
  const kast = divide(raw.kastRounds * 100, roundsCompleted);
  const utilityPerRound = divide(totalThrows, roundsStarted);
  const flashAssistPercent = divide(raw.flashAssists * 100, throws.flashbang);
  const avgBlindSecondsPerFlash = divide(raw.utility.totalBlindSeconds, throws.flashbang);
  const utilityDamagePerRound = divide(raw.utility.utilityDamageTotal, roundsStarted);
  const avgTeamDamagePerRound = divide(raw.utility.teamUtilityDamage + raw.utility.teamDamageWhileTeamFlashed, roundsStarted);
  const avgUnusedUtilityDollars = divide(raw.utility.totalUnusedUtilityValue, roundsCompleted);
  const damagePerShot = divide(raw.totalDamage, raw.shotsFired);
  const general = {
    kills: raw.kills,
    deaths: raw.deaths,
    assists: raw.assists,
    flashAssists: raw.flashAssists,
    kd,
    kdr: kd,
    adr,
    kast,
    totalDamage: raw.totalDamage,
    damageReceived: raw.damageReceived,
    assistDamage: raw.assistDamage,
  };
  const performance = {
    totalDamage: raw.totalDamage,
    damageReceived: raw.damageReceived,
    assistDamage: raw.assistDamage,
    headshotKills: raw.headshotKills,
    totalKills: raw.totalKills,
    headshotPercent,
    headshotPercentExcludingAwp,
    heDamage: raw.heDamage,
    molotovDamage: raw.molotovDamage,
    enemiesFlashed: raw.enemiesFlashed,
    shotsFired: raw.shotsFired,
    shotsHit: raw.shotsHit,
    accuracy,
    damagePerShot,
    roundsSurvivedCount: raw.roundsSurvivedCount,
    roundsSurvivedPercent,
    bombsPlanted: raw.bombsPlanted,
    bombsDefused: raw.bombsDefused,
  };
  const utility = {
    ...raw.utility,
    flashConversions: raw.flashAssists,
    totalThrows,
    utilityPerRound,
    flashAssistPercent,
    averageBlindSecondsPerFlash: avgBlindSecondsPerFlash,
    utilityDamagePerRound,
    averageTeamDamagePerRound: avgTeamDamagePerRound,
    averageUnusedUtilityDollars: avgUnusedUtilityDollars,
  };
  return {
    ...raw,
    utility,
    general,
    performance,
    roundsStarted,
    roundsPlayed: roundsStarted,
    roundsCompletedCount: roundsCompleted,
    totalThrows,
    utilityThrown: totalThrows,
    utilityDamage: raw.utility.utilityDamageTotal,
    utilityDamageTotal: raw.utility.utilityDamageTotal,
    utilityKills: raw.utility.utilityKills,
    teamFlashes: raw.utility.teamFlashes,
    flashesWithNoEnemyBlind: raw.utility.flashesWithNoEnemyBlind,
    flashConversions: raw.flashAssists,
    totalBlindSeconds: raw.utility.totalBlindSeconds,
    teamUtilityDamage: raw.utility.teamUtilityDamage,
    teamDamageWhileTeamFlashed: raw.utility.teamDamageWhileTeamFlashed,
    totalUnusedUtilityValue: raw.utility.totalUnusedUtilityValue,
    utilityThrowsFlash: throws.flashbang,
    utilityThrowsHe: throws.heGrenade,
    utilityThrowsSmoke: throws.smoke,
    utilityThrowsMolly: throws.molotovIncendiary,
    utilityThrowsDecoy: throws.decoy,
    kd,
    kdr: kd,
    adr,
    kast,
    headshots: raw.headshotKills,
    headshotPct: headshotPercent,
    headshotPercent,
    headshotPercentExcludingAwp,
    shots: raw.shotsFired,
    hits: raw.shotsHit,
    accuracy,
    accuracyPct: accuracy,
    damage: raw.totalDamage,
    damagePerShot,
    survivedRounds: raw.roundsSurvivedCount,
    survivalPct: roundsSurvivedPercent,
    roundsSurvivedPercent,
    plants: raw.bombsPlanted,
    defuses: raw.bombsDefused,
    utilityPerRound,
    flashAssistPercent,
    avgBlindSecondsPerFlash,
    utilityDamagePerRound,
    avgTeamDamagePerRound,
    avgUnusedUtilityDollars,
    flashes: raw.enemiesFlashed,
  };
}

/** @param {AnyRecord[]} rows @param {string} label @param {string} sideKey @param {number} roundsStarted @param {number} roundsCompleted @returns {AnyRecord} */
function aggregateRows(rows, label, sideKey, roundsStarted, roundsCompleted) {
  const total = makeRawStats();
  for (const row of rows) {
    for (const key of [
      'kills',
      'deaths',
      'assists',
      'flashAssists',
      'totalDamage',
      'damageReceived',
      'assistDamage',
      'headshotKills',
      'totalKills',
      'nonAwpKills',
      'nonAwpHeadshotKills',
      'heDamage',
      'molotovDamage',
      'enemiesFlashed',
      'shotsFired',
      'shotsHit',
      'bombsPlanted',
      'bombsDefused',
      'roundsSurvivedCount',
      'kastRounds',
    ]) {
      total[key] += finiteNumber(row[key]);
    }
    for (const key of Object.keys(total.utility.throws)) {
      total.utility.throws[key] += finiteNumber(row.utility?.throws?.[key]);
    }
    for (const key of [
      'flashesWithNoEnemyBlind',
      'flashConversions',
      'totalBlindSeconds',
      'teamFlashes',
      'utilityKills',
      'utilityDamageTotal',
      'teamUtilityDamage',
      'teamDamageWhileTeamFlashed',
      'totalUnusedUtilityValue',
    ]) {
      total.utility[key] += finiteNumber(row.utility?.[key]);
    }
  }
  // Aggregate survival/KAST percentages use player-rounds, while team ADR and
  // utility-per-round intentionally remain totals per match round.
  const completedPlayerRounds = roundsCompleted * Math.max(1, rows.length);
  const result = finalizeStats(total, roundsStarted, completedPlayerRounds);
  result.roundsCompletedCount = roundsCompleted;
  result.label = label;
  result.name = label;
  result.sideKey = sideKey;
  return result;
}

/** @param {AnyRecord} bundle @param {number} tick @param {string} teamId @param {string[]} members @param {AnyRecord[]} rounds @returns {'CT'|'T'|'?'} */
function teamSideAtTick(bundle, tick, teamId, members, rounds) {
  const activeRound = roundAtTick(rounds, tick);
  if (activeRound?.ctTeamId === teamId) return SIDE_CT;
  if (activeRound?.tTeamId === teamId) return SIDE_T;
  let ct = 0;
  let t = 0;
  for (const id of members) {
    const side = getPlayerStateAtTick(bundle, id, tick)?.side;
    if (side === SIDE_CT) ct += 1;
    if (side === SIDE_T) t += 1;
  }
  return ct === t ? SIDE_UNKNOWN : ct > t ? SIDE_CT : SIDE_T;
}

/** @param {AnyRecord} bundle @param {AnyRecord} round @param {string} side @param {Record<string,string>} teamByPlayer @returns {string} */
function logicalTeamForRoundSide(bundle, round, side, teamByPlayer) {
  if (side === SIDE_CT && round.ctTeamId) return String(round.ctTeamId);
  if (side === SIDE_T && round.tTeamId) return String(round.tTeamId);
  const votes = new Map();
  for (const [playerId, teamId] of Object.entries(teamByPlayer)) {
    if (getPlayerStateAtTick(bundle, playerId, roundProbeTick(round))?.side === side) {
      votes.set(teamId, finiteNumber(votes.get(teamId)) + 1);
    }
  }
  return [...votes].sort((left, right) => right[1] - left[1])[0]?.[0] || '';
}

/** @param {AnyRecord} track @param {AnyRecord} round @returns {number} */
function unusedUtilityValue(track, round) {
  const ticks = trackTicks(track);
  const index = floorIndex(ticks, round.endTick);
  if (index < 0) {
    return 0;
  }
  const inventory = safeArray(trackValue(track, ['inventory', 'weapons'], index));
  const side = normalizeSide(trackValue(track, ['team', 'side', 'teamName'], index));
  let value = 0;
  for (const item of inventory) {
    const type = normalizeUtilityType(item?.name ?? item?.weapon ?? item);
    if (type === 'flash') value += UTILITY_PRICES.flash;
    if (type === 'he') value += UTILITY_PRICES.he;
    if (type === 'smoke') value += UTILITY_PRICES.smoke;
    if (type === 'decoy') value += UTILITY_PRICES.decoy;
    if (type === 'inferno') value += side === SIDE_CT ? UTILITY_PRICES.infernoCT : UTILITY_PRICES.infernoT;
  }
  return value;
}

/** @param {AnyRecord} bundle @returns {AnyRecord[]} */
function utilityThrowRows(bundle) {
  const tracks = tracksOf(bundle);
  const primary = recordArray(tracks.utilityThrows);
  const source = primary.length ? primary : recordArray(tracks.nades).filter((row) => normalizeWeapon(row.type) !== 'infernoextinguish');
  const seen = new Set();
  return source.filter((row) => {
    const type = normalizeUtilityType(row.type ?? row.weapon ?? row.grenadeType);
    const thrower = firstId(row, ['throwerSteamId', 'playerSteamId', 'steamId']);
    if (!type || !thrower) {
      return false;
    }
    const key = `${Math.round(finiteNumber(row.tick))}|${thrower}|${type}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Compute all live statistics using only events at or before `tick`. Calling
 * this with `getFinalTick(bundle)` produces the full-match view.
 *
 * @param {AnyRecord} bundle
 * @param {number} [tick]
 * @returns {AnyRecord}
 */
export function computeMatchStats(bundle, tick = getFinalTick(bundle)) {
  const safeBundle = bundle && typeof bundle === 'object' ? bundle : {};
  const finalTick = getFinalTick(safeBundle);
  const requestedTick = Number.isFinite(Number(tick)) ? Number(tick) : finalTick;
  const cutoff = Math.max(0, Math.min(finalTick, Math.round(requestedTick)));
  const rounds = normalizedRounds(safeBundle, finalTick);
  const startedRounds = rounds.filter((round) => round.startTick <= cutoff);
  const completedRounds = rounds.filter((round) => round.endTick <= cutoff);
  const roundCountStarted = startedRounds.length;
  const roundCountCompleted = completedRounds.length;
  const directory = collectPlayerDirectory(safeBundle);
  const logical = inferLogicalTeams(safeBundle);
  const teamByPlayer = logical.teamByPlayer;
  const tracks = tracksOf(safeBundle);
  const tickRate = Math.max(1, finiteNumber(safeBundle?.meta?.tickRate, 64));

  /** @type {Map<string, AnyRecord>} */
  const internals = new Map();
  for (const [id, player] of directory) {
    internals.set(id, {
      player,
      raw: makeRawStats(),
      flags: new Map(),
      startedRounds: startedRounds.filter((round) => participatesInRound(safeBundle, player, round, cutoff)),
      completedRounds: completedRounds.filter((round) => participatesInRound(safeBundle, player, round, cutoff)),
    });
  }
  /** @param {string} id @returns {AnyRecord|null} */
  const internalFor = (id) => internals.get(id) || null;
  /** @param {string} id @param {AnyRecord|null} round @returns {AnyRecord|null} */
  const flagsFor = (id, round) => {
    const internal = internalFor(id);
    if (!internal || !round) return null;
    const key = String(round.index);
    if (!internal.flags.has(key)) {
      internal.flags.set(key, { kill: false, assist: false, death: false, traded: false, survived: false });
    }
    return internal.flags.get(key);
  };

  // Firearm-only weapon_fire rows. Parser-provided didDamage is the canonical
  // hit signal, preventing bullet impacts through surfaces from inflating it.
  for (const shot of recordArray(tracks.shots)) {
    const eventTick = Math.round(finiteNumber(shot.tick));
    if (eventTick > cutoff) continue;
    const id = firstId(shot, ['shooterSteamId', 'shooterId', 'steamId']);
    const internal = internalFor(id);
    const firearm = shot.isFirearm === true || (shot.isFirearm !== false && isFirearmWeapon(shot.weapon));
    if (!internal || !firearm) continue;
    internal.raw.shotsFired += 1;
    if (shot.didDamage === true || shot.hit === true || finiteNumber(shot.hits) > 0) {
      internal.raw.shotsHit += 1;
    }
  }

  const throws = utilityThrowRows(safeBundle)
    .filter((row) => finiteNumber(row.tick) <= cutoff)
    .map((row, index) => ({
      row,
      key: index,
      tick: Math.round(finiteNumber(row.tick)),
      thrower: firstId(row, ['throwerSteamId', 'playerSteamId', 'steamId']),
      type: normalizeUtilityType(row.type ?? row.weapon ?? row.grenadeType),
      matchedEnemyBlind: false,
    }));
  for (const thrown of throws) {
    const internal = internalFor(thrown.thrower);
    if (!internal) continue;
    if (thrown.type === 'flash') internal.raw.utility.throws.flashbang += 1;
    if (thrown.type === 'he') internal.raw.utility.throws.heGrenade += 1;
    if (thrown.type === 'smoke') internal.raw.utility.throws.smoke += 1;
    if (thrown.type === 'inferno') internal.raw.utility.throws.molotovIncendiary += 1;
    if (thrown.type === 'decoy') internal.raw.utility.throws.decoy += 1;
  }

  /** @type {Record<string, Array<{thrower:string,startTick:number,endTick:number}>>} */
  const teamFlashWindows = {};
  for (const blind of recordArray(tracks.blinds)) {
    const eventTick = Math.round(finiteNumber(blind.tick));
    if (eventTick > cutoff) continue;
    const attacker = firstId(blind, ['attackerSteamId', 'attackerId']);
    const victim = firstId(blind, ['victimSteamId', 'victimId', 'userSteamId']);
    const internal = internalFor(attacker);
    if (!internal || !attacker || !victim) continue;
    const endTick = Math.max(eventTick + 1, Math.round(finiteNumber(blind.endTick, eventTick + tickRate)));
    const duration = Math.max(0, finiteNumber(blind.durationSec, (endTick - eventTick) / tickRate));
    const enemy = areEnemies(
      attacker,
      victim,
      eventTick,
      safeBundle,
      teamByPlayer,
      String(blind.attackerTeamId ?? ''),
      String(blind.victimTeamId ?? '')
    );
    if (enemy) {
      internal.raw.enemiesFlashed += 1;
      internal.raw.utility.totalBlindSeconds += duration;
      const candidates = throws
        .filter(
          (row) =>
            row.type === 'flash' &&
            row.thrower === attacker &&
            row.tick >= eventTick - tickRate * 8 &&
            row.tick <= eventTick + 2
        )
        .sort((left, right) => Math.abs(eventTick - left.tick) - Math.abs(eventTick - right.tick));
      if (candidates[0]) candidates[0].matchedEnemyBlind = true;
    } else if (attacker !== victim) {
      internal.raw.utility.teamFlashes += 1;
      teamFlashWindows[victim] ||= [];
      teamFlashWindows[victim].push({ thrower: attacker, startTick: eventTick, endTick });
    }
  }
  for (const thrown of throws) {
    if (thrown.type === 'flash' && !thrown.matchedEnemyBlind) {
      const internal = internalFor(thrown.thrower);
      if (internal) internal.raw.utility.flashesWithNoEnemyBlind += 1;
    }
  }

  /** @type {Map<string, Array<{tick:number,attacker:string,damage:number}>>} */
  const damageContributions = new Map();
  for (const hurt of recordArray(tracks.hurts)) {
    const eventTick = Math.round(finiteNumber(hurt.tick));
    if (eventTick > cutoff) continue;
    const attacker = firstId(hurt, ['attackerSteamId', 'attackerId']);
    const victim = firstId(hurt, ['victimSteamId', 'victimId', 'userSteamId']);
    const damage = Math.max(0, finiteNumber(hurt.damageHealth ?? hurt.damage ?? hurt.dmgHealth));
    if (!attacker || !victim || !damage) continue;
    const enemy = areEnemies(
      attacker,
      victim,
      eventTick,
      safeBundle,
      teamByPlayer,
      String(hurt.attackerTeamId ?? ''),
      String(hurt.victimTeamId ?? '')
    );
    const attackerInternal = internalFor(attacker);
    const victimInternal = internalFor(victim);
    const utilityType = normalizeUtilityType(hurt.weapon);
    if (attackerInternal && enemy) {
      attackerInternal.raw.totalDamage += damage;
      if (utilityType) attackerInternal.raw.utility.utilityDamageTotal += damage;
      if (utilityType === 'he') attackerInternal.raw.heDamage += damage;
      if (utilityType === 'inferno') attackerInternal.raw.molotovDamage += damage;
    }
    if (attackerInternal && utilityType && !enemy && attacker !== victim) {
      attackerInternal.raw.utility.teamUtilityDamage += damage;
    }
    if (victimInternal && enemy) {
      victimInternal.raw.damageReceived += damage;
    }
    const round = roundAtTick(rounds, eventTick);
    if (enemy && round) {
      const key = `${round.index}|${victim}`;
      if (!damageContributions.has(key)) damageContributions.set(key, []);
      damageContributions.get(key).push({ tick: eventTick, attacker, damage });
    }
    if (enemy) {
      const credited = new Set();
      for (const window of teamFlashWindows[victim] || []) {
        if (eventTick < window.startTick || eventTick > window.endTick || credited.has(window.thrower)) continue;
        const throwerInternal = internalFor(window.thrower);
        if (throwerInternal) {
          throwerInternal.raw.utility.teamDamageWhileTeamFlashed += damage;
          credited.add(window.thrower);
        }
      }
    }
  }

  const killRows = recordArray(tracks.kills)
    .filter((row) => finiteNumber(row.tick) <= cutoff)
    .sort((left, right) => finiteNumber(left.tick) - finiteNumber(right.tick));
  /** @type {Array<{tick:number,killer:string,victim:string,round:AnyRecord|null}>} */
  const enemyKills = [];
  for (const kill of killRows) {
    const eventTick = Math.round(finiteNumber(kill.tick));
    const killer = firstId(kill, ['killerSteamId', 'attackerSteamId', 'killerId']);
    const victim = firstId(kill, ['victimSteamId', 'userSteamId', 'victimId']);
    const round = roundAtTick(rounds, eventTick);
    const victimInternal = internalFor(victim);
    if (victimInternal) {
      victimInternal.raw.deaths += 1;
      const flags = flagsFor(victim, round);
      if (flags) flags.death = true;
    }
    const enemy = areEnemies(
      killer,
      victim,
      eventTick,
      safeBundle,
      teamByPlayer,
      String(kill.killerTeamId ?? kill.attackerTeamId ?? ''),
      String(kill.victimTeamId ?? '')
    );
    const killerInternal = internalFor(killer);
    if (!enemy || !killerInternal) continue;
    killerInternal.raw.kills += 1;
    killerInternal.raw.totalKills += 1;
    if (kill.headshot) killerInternal.raw.headshotKills += 1;
    const weapon = normalizeWeapon(kill.weapon);
    if (weapon !== 'awp') {
      killerInternal.raw.nonAwpKills += 1;
      if (kill.headshot) killerInternal.raw.nonAwpHeadshotKills += 1;
    }
    if (normalizeUtilityType(kill.weapon)) killerInternal.raw.utility.utilityKills += 1;
    const killerFlags = flagsFor(killer, round);
    if (killerFlags) killerFlags.kill = true;

    /** @type {Map<string, boolean>} */
    const assisterIds = new Map();
    const parsedAssister = firstId(kill, ['assisterSteamId', 'assistantSteamId', 'assisterId']);
    const parsedFlashAssister = firstId(kill, ['flashAssisterSteamId', 'flashbangAssisterSteamId']);
    if (parsedAssister) assisterIds.set(parsedAssister, Boolean(kill.assistedFlash ?? kill.flashAssist ?? kill.assisterFlash));
    if (parsedFlashAssister) assisterIds.set(parsedFlashAssister, true);
    for (const [assister, flash] of assisterIds) {
      const assisterInternal = internalFor(assister);
      if (!assisterInternal || assister === killer || assister === victim) continue;
      const sameTeam = !areEnemies(assister, killer, eventTick, safeBundle, teamByPlayer);
      if (!sameTeam) continue;
      assisterInternal.raw.assists += 1;
      if (flash) {
        assisterInternal.raw.flashAssists += 1;
        assisterInternal.raw.utility.flashConversions += 1;
      }
      const assistFlags = flagsFor(assister, round);
      if (assistFlags) assistFlags.assist = true;
      if (round) {
        const key = `${round.index}|${victim}`;
        assisterInternal.raw.assistDamage += (damageContributions.get(key) || [])
          .filter((row) => row.attacker === assister && row.tick <= eventTick)
          .reduce((sum, row) => sum + row.damage, 0);
      }
    }
    enemyKills.push({ tick: eventTick, killer, victim, round });
  }

  // KAST trade window: a teammate kills the original killer within five seconds.
  for (const death of enemyKills) {
    const traded = enemyKills.find(
      (candidate) =>
        candidate.round?.index === death.round?.index &&
        candidate.tick >= death.tick &&
        candidate.tick <= death.tick + tickRate * 5 &&
        candidate.victim === death.killer &&
        !areEnemies(candidate.killer, death.victim, candidate.tick, safeBundle, teamByPlayer)
    );
    if (traded) {
      const flags = flagsFor(death.victim, death.round);
      if (flags) flags.traded = true;
    }
  }

  for (const bomb of recordArray(tracks.bombs)) {
    const eventTick = Math.round(finiteNumber(bomb.tick));
    if (eventTick > cutoff) continue;
    const playerId = firstId(bomb, ['playerSteamId', 'steamId', 'playerId']);
    const internal = internalFor(playerId);
    if (!internal) continue;
    const type = normalizeWeapon(bomb.type ?? bomb.event);
    if (type === 'planted' || type === 'bombplanted') internal.raw.bombsPlanted += 1;
    if (type === 'defused' || type === 'bombdefused') internal.raw.bombsDefused += 1;
  }

  const tickTracks = tickTracksOf(safeBundle);
  for (const [playerId, internal] of internals) {
    const completedForPlayer = internal.completedRounds;
    for (const round of completedForPlayer) {
      const flags = flagsFor(playerId, round);
      if (!flags) continue;
      const state = getPlayerStateAtTick(safeBundle, playerId, round.endTick);
      const survived = !flags.death && state?.isAlive !== false;
      if (survived) {
        flags.survived = true;
        internal.raw.roundsSurvivedCount += 1;
      }
      if (flags.kill || flags.assist || flags.traded || flags.survived) {
        internal.raw.kastRounds += 1;
      }
      const track = tickTracks[playerId];
      if (track) internal.raw.utility.totalUnusedUtilityValue += unusedUtilityValue(track, round);
    }
  }

  /** @type {AnyRecord[]} */
  const players = [];
  for (const [playerId, internal] of internals) {
    const teamId = teamByPlayer[playerId] || '';
    const logicalTeam = logical.teams.find((team) => team.id === teamId);
    const side = getPlayerStateAtTick(safeBundle, playerId, cutoff)?.side || SIDE_UNKNOWN;
    const finalized = finalizeStats(internal.raw, internal.startedRounds.length, internal.completedRounds.length);
    players.push({
      steamId: playerId,
      name: internal.player.name || playerId,
      teamId,
      teamLabel: logicalTeam?.name || 'Other',
      team: side,
      side,
      sideKey: side,
      ...finalized,
    });
  }

  /** @type {Record<string, number>} */
  const scores = {};
  for (const team of logical.teams) scores[team.id] = 0;
  for (const round of completedRounds) {
    const winnerSide = normalizeSide(round.winner ?? round.winnerSide);
    const winnerId = winnerSide === SIDE_UNKNOWN ? String(round.winnerTeamId ?? '') : logicalTeamForRoundSide(safeBundle, round, winnerSide, teamByPlayer);
    if (winnerId && Object.prototype.hasOwnProperty.call(scores, winnerId)) scores[winnerId] += 1;
  }

  const teams = logical.teams.map((team) => {
    const teamPlayers = players
      .filter((player) => player.teamId === team.id)
      .sort((left, right) => right.kills - left.kills || left.deaths - right.deaths || left.name.localeCompare(right.name));
    const side = teamSideAtTick(safeBundle, cutoff, team.id, team.memberIds, rounds);
    const stats = aggregateRows(teamPlayers, team.name, side, roundCountStarted, roundCountCompleted);
    return { id: team.id, name: team.name, side, score: scores[team.id] || 0, players: teamPlayers, stats, ...stats };
  });
  const teamOrder = new Map(teams.map((team, index) => [team.id, index]));
  players.sort(
    (left, right) =>
      finiteNumber(teamOrder.get(left.teamId), 999) - finiteNumber(teamOrder.get(right.teamId), 999) ||
      right.kills - left.kills ||
      left.deaths - right.deaths ||
      left.name.localeCompare(right.name)
  );
  const allStats = aggregateRows(players, 'All Players', 'ALL', roundCountStarted, roundCountCompleted);

  return {
    tick: cutoff,
    finalTick,
    roundsPlayed: roundCountStarted,
    roundsStarted: roundCountStarted,
    roundsCompleted: roundCountCompleted,
    players,
    teams,
    aggregates: [allStats, ...teams.map((team) => team.stats)],
  };
}

