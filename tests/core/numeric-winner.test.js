import assert from 'node:assert/strict';
import test from 'node:test';
import parserCore from '../../src/core/demo-viewer.cjs';

const { buildRounds, sideFromTeam } = parserCore;

test('numeric Source team ids normalize to T and CT', () => {
  assert.equal(sideFromTeam(2), 'T');
  assert.equal(sideFromTeam('2'), 'T');
  assert.equal(sideFromTeam(3), 'CT');
  assert.equal(sideFromTeam('3'), 'CT');
});

test('round construction retains numeric winner ids as physical sides', () => {
  const rounds = buildRounds(
    [{ tick: 100, round: 1 }, { tick: 300, round: 2 }],
    [{ tick: 250, winner: 2 }, { tick: 450, winner: 3 }],
    [{ tick: 120 }, { tick: 320 }]
  );
  assert.equal(rounds[0].winner, 'T');
  assert.equal(rounds[1].winner, 'CT');
});
