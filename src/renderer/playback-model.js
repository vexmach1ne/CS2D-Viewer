// @ts-check

/** @param {unknown} value @param {number} [fallback] */
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

/** @param {unknown} value @returns {any[]} */
function array(value) {
  return Array.isArray(value) ? value : [];
}

/** @template T @param {T[]} rows @param {number} target @param {(row:T)=>number} [selector] */
export function lowerBound(rows, target, selector = (row) => finite(row)) {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (selector(rows[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** @template T @param {T[]} rows @param {number} target @param {(row:T)=>number} [selector] */
export function upperBound(rows, target, selector = (row) => finite(row)) {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (selector(rows[mid]) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** @param {unknown} numbers @param {number} target */
export function floorIndex(numbers, target) {
  return upperBound(array(numbers), target, (row) => finite(row)) - 1;
}

/** @param {unknown} value @returns {'CT'|'T'|'?'} */
function normalizeSide(value) {
  const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (clean === 'CT' || clean.includes('COUNTERTERRORIST')) return 'CT';
  if (clean === 'T' || clean === 'TERRORIST' || clean === 'TERRORISTS') return 'T';
  const numeric = Number(value);
  if (numeric === 3) return 'CT';
  if (numeric === 2) return 'T';
  return '?';
}

/** @param {any} track @param {string} key @param {number} index @param {any} [fallback] */
function trackValue(track, key, index, fallback = null) {
  const rows = array(track?.[key]);
  return index >= 0 && index < rows.length && rows[index] != null ? rows[index] : fallback;
}

/** @param {unknown} a @param {unknown} b @param {number} mix */
function interpolateAngle(a, b, mix) {
  return finite(a) + (((finite(b) - finite(a) + 540) % 360) - 180) * mix;
}

/** @param {any} track @param {number} tick @returns {null|Record<string, any>} */
export function samplePlayerTrack(track, tick) {
  const ticks = array(track?.tick);
  if (!ticks.length) return null;
  const upper = lowerBound(ticks, tick, (value) => finite(value));
  const left = clamp(upper - 1, 0, ticks.length - 1);
  const right = clamp(upper, 0, ticks.length - 1);
  const leftTick = finite(ticks[left]);
  const rightTick = finite(ticks[right], leftTick);
  const mix = rightTick > leftTick ? clamp((tick - leftTick) / (rightTick - leftTick), 0, 1) : 0;
  const x = finite(trackValue(track, 'x', left));
  const y = finite(trackValue(track, 'y', left));
  return {
    steamId: String(track?.steamId || ''), name: String(track?.name || ''),
    x: x + (finite(trackValue(track, 'x', right), x) - x) * mix,
    y: y + (finite(trackValue(track, 'y', right), y) - y) * mix,
    yaw: interpolateAngle(trackValue(track, 'yaw', left, 0), trackValue(track, 'yaw', right, 0), mix),
    health: Math.round(finite(trackValue(track, 'health', left))), isAlive: Boolean(trackValue(track, 'isAlive', left)),
    side: normalizeSide(trackValue(track, 'team', left, '?')), weapon: String(trackValue(track, 'weapon', left, '') || ''),
    inventory: array(trackValue(track, 'inventory', left, [])), armor: Math.round(finite(trackValue(track, 'armor', left))),
    money: trackValue(track, 'money', left, null), hasHelmet: Boolean(trackValue(track, 'hasHelmet', left)),
    hasDefuser: Boolean(trackValue(track, 'hasDefuser', left)),
  };
}

/** @param {any} bundle @param {number} tick */
export function buildPlayerState(bundle, tick) {
  /** @type {Record<string, Record<string, any>>} */
  const result = {};
  const players = new Map(array(bundle?.players).map((player) => [String(player?.steamId || ''), String(player?.name || '')]));
  for (const [steamId, track] of Object.entries(bundle?.tracks?.ticksByPlayer || {})) {
    const row = samplePlayerTrack(track, tick);
    if (!row) continue;
    row.steamId = steamId;
    row.name ||= players.get(steamId) || steamId;
    result[steamId] = row;
  }
  return result;
}

/** @param {any} bundle */
export function maxTrackTick(bundle) {
  let max = 0;
  const tracks = bundle?.tracks || {};
  for (const key of ['shots', 'hurts', 'blinds', 'kills', 'nades', 'utilityThrows', 'bombs', 'doors']) {
    const rows = array(tracks[key]);
    if (rows.length) max = Math.max(max, finite(rows[rows.length - 1]?.tick));
  }
  for (const track of Object.values(tracks.ticksByPlayer || {})) {
    const ticks = array(track?.tick);
    if (ticks.length) max = Math.max(max, finite(ticks[ticks.length - 1]));
  }
  return max;
}

/** @param {any} bundle @param {number} tick */
export function resetEventCursors(bundle, tick) {
  const tracks = bundle?.tracks || {};
  const atTick = (/** @type {any} */ row) => finite(row?.tick);
  return {
    shots: upperBound(array(tracks.shots), tick, atTick), nades: upperBound(array(tracks.nades), tick, atTick),
    bombs: upperBound(array(tracks.bombs), tick, atTick), hurts: upperBound(array(tracks.hurts), tick, atTick),
    doors: upperBound(array(tracks.doors), tick, atTick),
    rounds: upperBound(array(bundle?.rounds), tick, (row) => finite(row?.endTick)),
  };
}

/** @param {any} bundle @param {number} previousTick @param {number} requestedTick @param {{forceReset?:boolean,resetThresholdTicks?:number}} [options] */
export function resolveSeek(bundle, previousTick, requestedTick, options = {}) {
  const totalTicks = Math.max(1, Math.round(finite(bundle?.meta?.totalTicks, 1)));
  const tickFloat = clamp(requestedTick, 0, totalTicks);
  const tick = Math.round(tickFloat);
  const resetThreshold = Math.max(0, finite(options.resetThresholdTicks, Infinity));
  const reset = Boolean(options.forceReset || tick < previousTick || Math.abs(tick - previousTick) > resetThreshold);
  return { tick, tickFloat, reset, cursors: reset ? resetEventCursors(bundle, tick) : null };
}

/** @param {any} bundle @param {number} tick */
export function roundIndexAtTick(bundle, tick) {
  let found = -1;
  array(bundle?.rounds).forEach((round, index) => { if (finite(round?.startTick) <= tick) found = index; });
  return found;
}

/** @param {any} bundle @param {number} tick @param {number} direction */
export function jumpRoundTick(bundle, tick, direction) {
  const rounds = array(bundle?.rounds);
  if (!rounds.length) return null;
  const targetIndex = clamp(roundIndexAtTick(bundle, tick) + Math.sign(direction), 0, rounds.length - 1);
  return finite(rounds[targetIndex]?.startTick);
}


/**
 * Return the plant active at a selected tick without allowing an unterminated
 * plant to leak into a later round.
 * @param {any} bundle
 * @param {number} tick
 */
export function activeBombAtTick(bundle, tick) {
  const roundIndex = roundIndexAtTick(bundle, tick);
  const round = array(bundle?.rounds)[roundIndex];
  if (!round) return null;
  const roundStart = finite(round.startTick);
  const roundEnd = finite(round.endTick, Math.max(1, finite(bundle?.meta?.totalTicks, 1)));
  if (tick < roundStart || tick > roundEnd) return null;
  const bombs = array(bundle?.tracks?.bombs);
  for (let index = floorIndex(bombs.map((row) => finite(row?.tick)), tick); index >= 0; index -= 1) {
    const plant = bombs[index];
    const plantTick = finite(plant?.tick);
    if (plantTick < roundStart) break;
    if (String(plant?.type) !== 'planted' || plantTick > roundEnd) continue;
    const terminal = bombs.slice(index + 1).find((row) =>
      finite(row?.tick) <= roundEnd && ['defused', 'exploded'].includes(String(row?.type))
    );
    return !terminal || finite(terminal.tick) > tick ? plant : null;
  }
  return null;
}
