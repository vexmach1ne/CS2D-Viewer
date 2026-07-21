import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeBombAtTick, buildPlayerState, floorIndex, isLiveRoundTick, jumpRoundTick, lowerBound, resetEventCursors,
  playbackRateAtTick, resolveSeek, roundIndexAtTick, samplePlayerTrack, upperBound,
} from '../src/renderer/playback-model.js';

function bundle() {
  return {
    meta: { viewerVersion: 'viewer-v1', tickRate: 10, totalTicks: 300 },
    players: [{ steamId: 'one', name: 'Alpha' }],
    rounds: [
      { round: 1, startTick: 20, endTick: 99 },
      { round: 2, startTick: 100, endTick: 199 },
      { round: 3, startTick: 200, endTick: 299 },
    ],
    tracks: {
      ticksByPlayer: {
        one: {
          tick: [20, 30], x: [0, 100], y: [20, 40], yaw: [350, 10],
          health: [100, 50], isAlive: [true, false], team: ['CT', 'T'],
          weapon: ['m4a4', 'ak-47'], inventory: [['m4a4'], ['ak-47']],
          armor: [100, 25], money: [800, 1200], hasHelmet: [true, false], hasDefuser: [true, false],
        },
      },
      shots: [{ tick: 22 }, { tick: 40 }, { tick: 80 }],
      nades: [{ tick: 25 }, { tick: 50 }], bombs: [{ tick: 60 }], hurts: [{ tick: 35 }],
      doors: [{ tick: 24 }, { tick: 75 }],
    },
  };
}

test('trail phase excludes freeze and post-round intervals', () => {
  const demo = bundle();
  demo.rounds[0].freezeEndTick = 35;
  demo.rounds[1].freezeEndTick = 110;
  assert.equal(isLiveRoundTick(demo, 34), false);
  assert.equal(isLiveRoundTick(demo, 35), true);
  assert.equal(isLiveRoundTick(demo, 99), true);
  assert.equal(isLiveRoundTick(demo, 100), false);
  assert.equal(isLiveRoundTick(demo, 110), true);
  assert.equal(isLiveRoundTick(demo, 305), false);
});

test('fast freeze-time playback is an eight-times multiplier only during freeze', () => {
  const demo = bundle();
  demo.rounds[0].freezeEndTick = 35;
  assert.equal(playbackRateAtTick(demo, 20, 1, true), 8);
  assert.equal(playbackRateAtTick(demo, 34.9, 2, true), 16);
  assert.equal(playbackRateAtTick(demo, 35, 1, true), 1);
  assert.equal(playbackRateAtTick(demo, 99, 1, true), 1);
  assert.equal(playbackRateAtTick(demo, 100, 1, true), 1);
  assert.equal(playbackRateAtTick(demo, 20, 2, false), 2);
});

test('binary search helpers select stable insertion and floor positions', () => {
  const ticks = [10, 20, 20, 40];
  assert.equal(lowerBound(ticks, 20), 1);
  assert.equal(upperBound(ticks, 20), 3);
  assert.equal(floorIndex(ticks, 19), 0);
  assert.equal(floorIndex(ticks, 5), -1);
});

test('player interpolation blends position and shortest-path yaw but not discrete state', () => {
  const row = samplePlayerTrack(bundle().tracks.ticksByPlayer.one, 25);
  assert.ok(row);
  assert.equal(row.x, 50);
  assert.equal(row.y, 30);
  assert.ok(Math.abs(row.yaw % 360) < 0.0001);
  assert.equal(row.health, 100);
  assert.equal(row.side, 'CT');
  assert.equal(row.weapon, 'm4a4');
});

test('player state uses bundle names and tolerates missing player tracks', () => {
  const demo = bundle();
  assert.deepEqual(Object.keys(buildPlayerState(demo, 25)), ['one']);
  assert.equal(buildPlayerState(demo, 25).one.name, 'Alpha');
  assert.deepEqual(buildPlayerState({ players: [], tracks: {} }, 25), {});
  assert.equal(samplePlayerTrack({}, 25), null);
});

test('backward and discontinuous seeks reset effect cursors after visible events', () => {
  const demo = bundle();
  const backward = resolveSeek(demo, 70, 30, { resetThresholdTicks: 20 });
  assert.equal(backward.reset, true);
  assert.deepEqual(backward.cursors, { shots: 1, nades: 1, bombs: 0, hurts: 0, doors: 1, rounds: 0 });
  const discontinuous = resolveSeek(demo, 30, 70, { resetThresholdTicks: 20 });
  assert.equal(discontinuous.reset, true);
  assert.deepEqual(discontinuous.cursors, resetEventCursors(demo, 70));
  const continuous = resolveSeek(demo, 30, 40, { resetThresholdTicks: 20 });
  assert.equal(continuous.reset, false);
  assert.equal(continuous.cursors, null);
});

test('round audio cursors advance only at a round end tick', () => {
  const demo = bundle();
  assert.equal(resetEventCursors(demo, 98).rounds, 0);
  assert.equal(resetEventCursors(demo, 99).rounds, 1);
  assert.equal(resetEventCursors(demo, 150).rounds, 1);
});
test('seek clamps to the bundle and explicit reset works with missing tracks', () => {
  const empty = { meta: { totalTicks: 100 }, rounds: [], tracks: {} };
  assert.deepEqual(resolveSeek(empty, 0, 500), { tick: 100, tickFloat: 100, reset: false, cursors: null });
  assert.deepEqual(resolveSeek(empty, 50, -5, { forceReset: true }).cursors,
    { shots: 0, nades: 0, bombs: 0, hurts: 0, doors: 0, rounds: 0 });
});

test('round navigation clamps at match boundaries and handles pre-match/missing rounds', () => {
  const demo = bundle();
  assert.equal(roundIndexAtTick(demo, 0), -1);
  assert.equal(roundIndexAtTick(demo, 150), 1);
  assert.equal(jumpRoundTick(demo, 0, 1), 20);
  assert.equal(jumpRoundTick(demo, 50, 1), 100);
  assert.equal(jumpRoundTick(demo, 250, 1), 200);
  assert.equal(jumpRoundTick(demo, 150, -1), 20);
  assert.equal(jumpRoundTick({ tracks: {} }, 0, 1), null);
});


test('unterminated plants do not remain active after their round', () => {
  const demo = bundle();
  demo.tracks.bombs = [{ tick: 80, type: 'planted', site: 'A' }];
  assert.equal(activeBombAtTick(demo, 90), demo.tracks.bombs[0]);
  assert.equal(activeBombAtTick(demo, 120), null);
});
