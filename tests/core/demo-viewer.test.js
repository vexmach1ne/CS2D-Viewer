import test from 'node:test';
import assert from 'node:assert/strict';

import parser from '../../src/core/demo-viewer.cjs';

test('exports viewer-v1 parser contract', () => {
  assert.equal(parser.VIEWER_SCHEMA, 'viewer-v1');
  assert.equal(parser.VIEWER_VERSION, 'viewer-v1');
  assert.equal(parser.PARSER_VERSION, '0.41.3');
});

test('buildRounds falls back to freeze-end rows and retains team names', () => {
  const rounds = parser.buildRounds(
    [],
    [{ tick: 2000, winner: 'CT', reason: 'target_saved', ct_name: 'Alpha', t_name: 'Bravo' }],
    [{ tick: 1000 }]
  );

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].startTick, 40);
  assert.equal(rounds[0].freezeEndTick, 1000);
  assert.equal(rounds[0].endTick, 2000);
  assert.equal(rounds[0].winner, 'CT');
  assert.equal(rounds[0].ctTeamName, 'Alpha');
  assert.equal(rounds[0].tTeamName, 'Bravo');
});

test('stable logical teams remain fixed across a halftime side switch', () => {
  const ticksByPlayer = {
    a1: { tick: [0, 1000], team: ['CT', 'T'] },
    a2: { tick: [0, 1000], team: ['CT', 'T'] },
    b1: { tick: [0, 1000], team: ['T', 'CT'] },
    b2: { tick: [0, 1000], team: ['T', 'CT'] },
  };
  const rounds = [
    {
      round: 1,
      startTick: 0,
      freezeEndTick: 8,
      endTick: 900,
      ctTeamName: 'Alpha',
      tTeamName: 'Bravo',
    },
    {
      round: 2,
      startTick: 1000,
      freezeEndTick: 1008,
      endTick: 1900,
      ctTeamName: 'Bravo',
      tTeamName: 'Alpha',
    },
  ];

  const result = parser.buildStableTeamIdentities(ticksByPlayer, rounds);

  assert.deepEqual(result.teams, [
    { id: 'TEAM_A', name: 'Alpha', startingSide: 'CT', playerSteamIds: ['a1', 'a2'] },
    { id: 'TEAM_B', name: 'Bravo', startingSide: 'T', playerSteamIds: ['b1', 'b2'] },
  ]);
  assert.deepEqual(result.playerTeamIds, {
    a1: 'TEAM_A',
    a2: 'TEAM_A',
    b1: 'TEAM_B',
    b2: 'TEAM_B',
  });
  assert.equal(result.rounds[0].ctTeamId, 'TEAM_A');
  assert.equal(result.rounds[0].tTeamId, 'TEAM_B');
  assert.equal(result.rounds[1].ctTeamId, 'TEAM_B');
  assert.equal(result.rounds[1].tTeamId, 'TEAM_A');
});

test('stable logical teams have deterministic blank-name fallbacks', () => {
  const result = parser.buildStableTeamIdentities(
    {
      ct: { tick: [0], team: ['CT'] },
      t: { tick: [0], team: ['T'] },
    },
    [{ round: 1, startTick: 0, freezeEndTick: null, endTick: 100 }]
  );

  assert.equal(result.teams[0].id, 'TEAM_A');
  assert.equal(result.teams[0].name, 'Team A');
  assert.equal(result.teams[1].id, 'TEAM_B');
  assert.equal(result.teams[1].name, 'Team B');
});

test('utility throws are deduplicated without collapsing distinct grenade types', () => {
  const rows = [
    { tick: 64, throwerSteamId: 'a', type: 'flash', x: 10, y: 20 },
    { tick: 65, throwerSteamId: 'a', type: 'flash', x: 10.5, y: 20.5 },
    { tick: 64, throwerSteamId: 'a', type: 'smoke', x: 10, y: 20 },
  ];

  assert.deepEqual(parser.dedupeUtilityThrows(rows), [rows[0], rows[2]]);
});

test('boolean event flags handle parser string values', () => {
  assert.equal(parser.parseBooleanFlag(false), false);
  assert.equal(parser.parseBooleanFlag('false'), false);
  assert.equal(parser.parseBooleanFlag('0'), false);
  assert.equal(parser.parseBooleanFlag(true), true);
  assert.equal(parser.parseBooleanFlag('true'), true);
  assert.equal(parser.parseBooleanFlag('1'), true);
});

test('progress payloads are normalized and callback errors cannot abort parsing', () => {
  const payloads = [];
  parser.reportProgress((payload) => payloads.push(payload), 'utility', 1.5, 'Parsing utility');
  assert.deepEqual(payloads, [
    { stage: 'utility', progress: 1, percent: 100, message: 'Parsing utility' },
  ]);
  assert.doesNotThrow(() => {
    parser.reportProgress(() => {
      throw new Error('UI was closed');
    }, 'complete', 1, 'Done');
  });
});
test('normalizes bomb and knife weapon names for icon lookups', () => {
  assert.equal(parser.normalizeWeaponName('weapon_c4_explosive'), 'c4');
  assert.equal(parser.normalizeWeaponName('C4 Explosive'), 'c4');
  assert.equal(parser.normalizeWeaponName('weapon_knife_karambit'), 'knife');
});