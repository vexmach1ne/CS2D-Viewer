import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeMatchStats,
  getFinalTick,
  inferLogicalTeams,
  isFirearmWeapon,
  normalizeUtilityType,
} from '../src/renderer/stats.js';

function makeTrack(steamId, name, teamA) {
  const tick = [0, 50, 99, 100, 150, 199, 200, 250, 300];
  const aSides = ['CT', 'CT', 'CT', 'T', 'T', 'T', 'CT', 'CT', 'CT'];
  const bSides = ['T', 'T', 'T', 'CT', 'CT', 'CT', 'T', 'T', 'T'];
  return {
    steamId,
    name,
    tick,
    team: teamA ? aSides : bSides,
    isAlive: tick.map(() => true),
    health: tick.map(() => 100),
    inventory: tick.map((value) => (teamA && (value === 99 || value === 199) ? ['smoke'] : [])),
  };
}

function makeBundle() {
  return {
    meta: {
      schemaVersion: 'viewer-v1',
      totalTicks: 300,
      tickRate: 64,
      teamNames: { ct: 'Alpha', t: 'Bravo' },
    },
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
      {
        round: 1,
        startTick: 0,
        endTick: 99,
        winner: 'CT',
        ctTeamId: 'TEAM_A',
        tTeamId: 'TEAM_B',
        ctTeamName: 'Alpha',
        tTeamName: 'Bravo',
      },
      {
        round: 2,
        startTick: 100,
        endTick: 199,
        winner: 'CT',
        ctTeamId: 'TEAM_B',
        tTeamId: 'TEAM_A',
        ctTeamName: 'Bravo',
        tTeamName: 'Alpha',
      },
      {
        round: 3,
        startTick: 200,
        endTick: 300,
        winner: 'T',
        ctTeamId: 'TEAM_A',
        tTeamId: 'TEAM_B',
        ctTeamName: 'Alpha',
        tTeamName: 'Bravo',
      },
    ],
    tracks: {
      ticksByPlayer: {
        a1: makeTrack('a1', 'Able', true),
        a2: makeTrack('a2', 'Arrow', true),
        b1: makeTrack('b1', 'Baker', false),
        b2: makeTrack('b2', 'Bolt', false),
      },
      shots: [
        { tick: 10, shooterSteamId: 'a1', weapon: 'ak-47', didDamage: true },
        { tick: 11, shooterSteamId: 'a1', weapon: 'knife', didDamage: true },
        { tick: 12, shooterSteamId: 'a1', weapon: 'hegrenade', didDamage: true },
        { tick: 110, shooterSteamId: 'a1', weapon: 'm4a1-s', didDamage: true },
        { tick: 210, shooterSteamId: 'a1', weapon: 'awp', didDamage: false },
      ],
      hurts: [
        { tick: 15, attackerSteamId: 'a2', victimSteamId: 'b1', weapon: 'ak47', damageHealth: 40 },
        { tick: 19, attackerSteamId: 'a1', victimSteamId: 'b1', weapon: 'ak47', damageHealth: 60 },
        { tick: 35, attackerSteamId: 'a1', victimSteamId: 'a2', weapon: 'ak47', damageHealth: 20 },
        { tick: 115, attackerSteamId: 'b1', victimSteamId: 'a1', weapon: 'm4a1', damageHealth: 100 },
        { tick: 125, attackerSteamId: 'b1', victimSteamId: 'a2', weapon: 'hegrenade', damageHealth: 30 },
        { tick: 215, attackerSteamId: 'a1', victimSteamId: 'b1', weapon: 'inferno', damageHealth: 50 },
      ],
      blinds: [
        { tick: 8, endTick: 72, attackerSteamId: 'a2', victimSteamId: 'b1', durationSec: 1 },
        { tick: 108, endTick: 172, attackerSteamId: 'b2', victimSteamId: 'a1', durationSec: 1 },
        { tick: 109, endTick: 141, attackerSteamId: 'b2', victimSteamId: 'b1', durationSec: 0.5 },
      ],
      kills: [
        {
          tick: 20,
          killerSteamId: 'a1',
          killerTeamId: 'TEAM_A',
          victimSteamId: 'b1',
          victimTeamId: 'TEAM_B',
          assisterSteamId: 'a2',
          assisterTeamId: 'TEAM_A',
          assistedFlash: false,
          weapon: 'ak47',
          headshot: true,
        },
        {
          tick: 30,
          killerSteamId: 'a1',
          killerTeamId: 'TEAM_A',
          victimSteamId: 'a1',
          victimTeamId: 'TEAM_A',
          weapon: 'world',
        },
        {
          tick: 40,
          killerSteamId: 'a1',
          killerTeamId: 'TEAM_A',
          victimSteamId: 'a2',
          victimTeamId: 'TEAM_A',
          weapon: 'ak47',
        },
        {
          tick: 120,
          killerSteamId: 'b1',
          killerTeamId: 'TEAM_B',
          victimSteamId: 'a1',
          victimTeamId: 'TEAM_A',
          assisterSteamId: 'b2',
          assisterTeamId: 'TEAM_B',
          assistedFlash: true,
          weapon: 'm4a1',
        },
        {
          tick: 220,
          killerSteamId: 'a1',
          killerTeamId: 'TEAM_A',
          victimSteamId: 'b1',
          victimTeamId: 'TEAM_B',
          assisterSteamId: 'a2',
          assisterTeamId: 'TEAM_A',
          assistedFlash: true,
          weapon: 'awp',
          headshot: false,
        },
      ],
      utilityThrows: [
        { tick: 5, throwerSteamId: 'a2', throwerTeamId: 'TEAM_A', type: 'flash' },
        { tick: 50, throwerSteamId: 'a1', throwerTeamId: 'TEAM_A', type: 'smoke' },
        { tick: 105, throwerSteamId: 'b2', throwerTeamId: 'TEAM_B', type: 'flash' },
        { tick: 130, throwerSteamId: 'b1', throwerTeamId: 'TEAM_B', type: 'he' },
        { tick: 205, throwerSteamId: 'a2', throwerTeamId: 'TEAM_A', type: 'flash' },
      ],
      // Detonations must not add throws while the canonical track is present.
      nades: [{ tick: 60, throwerSteamId: 'a1', type: 'he' }],
      bombs: [
        { tick: 67, playerSteamId: 'a1', type: 'plant_start' },
        { tick: 70, playerSteamId: 'a1', type: 'planted' },
        { tick: 160, playerSteamId: 'b1', type: 'defuse_start' },
        { tick: 170, playerSteamId: 'b1', type: 'defused' },
      ],
    },
  };
}

function player(stats, steamId) {
  const row = stats.players.find((candidate) => candidate.steamId === steamId);
  assert.ok(row, `missing player ${steamId}`);
  return row;
}

test('uses exact tick cutoffs and parsed direct/flash assists', () => {
  const bundle = /** @type {any} */ (makeBundle());
  const beforeKill = computeMatchStats(bundle, 119);
  const atKill = computeMatchStats(bundle, 120);

  assert.equal(beforeKill.roundsStarted, 2);
  assert.equal(beforeKill.roundsCompleted, 1);
  assert.equal(player(beforeKill, 'a1').deaths, 1);
  assert.equal(player(beforeKill, 'b2').assists, 0);

  assert.equal(atKill.tick, 120);
  assert.equal(player(atKill, 'a1').deaths, 2);
  assert.equal(player(atKill, 'b1').kills, 1);
  assert.equal(player(atKill, 'b2').assists, 1);
  assert.equal(player(atKill, 'b2').flashAssists, 1);
  assert.equal(player(atKill, 'b2').utility.flashConversions, 1);
  assert.equal(player(atKill, 'a2').assists, 1);
  assert.equal(player(atKill, 'a2').assistDamage, 40);
});

test('excludes suicides/team kills from kills but retains their deaths', () => {
  const current = computeMatchStats(makeBundle(), 120);
  const a1 = player(current, 'a1');
  const a2 = player(current, 'a2');

  assert.equal(a1.kills, 1, 'self and teammate kills are not enemy kills');
  assert.equal(a1.deaths, 2, 'suicide and later enemy death both count');
  assert.equal(a2.deaths, 1, 'the victim of a team kill still records a death');
  assert.equal(a1.totalKills, 1);
  assert.equal(a1.headshotKills, 1);
});

test('counts firearm shots and throw events, including undetonated utility', () => {
  const current = computeMatchStats(makeBundle(), 120);
  const a1 = player(current, 'a1');

  assert.equal(a1.shotsFired, 2);
  assert.equal(a1.shotsHit, 2);
  assert.equal(a1.accuracy, 100);
  assert.equal(a1.utility.throws.smoke, 1, 'undetonated canonical throw is retained');
  assert.equal(a1.utility.throws.heGrenade, 0, 'nade effects do not supplement a present throw track');
  assert.equal(a1.totalThrows, 1);
  assert.equal(isFirearmWeapon('weapon_m4a1_silencer'), true);
  assert.equal(isFirearmWeapon('knife_karambit'), false);
  assert.equal(isFirearmWeapon('weapon_hegrenade'), false);
  assert.equal(isFirearmWeapon('weapon_smokegrenade'), false);
  assert.equal(isFirearmWeapon('weapon_c4'), false);
  assert.equal(isFirearmWeapon('weapon_galilar'), true);
  assert.equal(normalizeUtilityType('incgrenade'), 'inferno');
});

test('falls back to deduplicated nade effects when utilityThrows is absent or empty', () => {
  const bundle = /** @type {any} */ (makeBundle());
  bundle.meta.totalTicks = 30;
  bundle.rounds = [
    { round: 1, startTick: 0, endTick: 30, ctTeamId: 'TEAM_A', tTeamId: 'TEAM_B', winner: 'CT' },
  ];
  bundle.tracks.utilityThrows = [];
  bundle.tracks.nades = [
    { tick: 10, throwerSteamId: 'a1', type: 'he' },
    { tick: 10, throwerSteamId: 'a1', type: 'he' },
    { tick: 20, throwerSteamId: 'a1', type: 'smoke' },
    { tick: 25, throwerSteamId: 'a1', type: 'inferno_extinguish' },
  ];

  const a1 = player(computeMatchStats(bundle, 30), 'a1');
  assert.equal(a1.utility.throws.heGrenade, 1);
  assert.equal(a1.utility.throws.smoke, 1);
  assert.equal(a1.totalThrows, 2);
});

test('computes final damage, ADR, survival, objectives, and utility metrics', () => {
  const full = computeMatchStats(makeBundle(), 300);
  const a1 = player(full, 'a1');
  const a2 = player(full, 'a2');
  const b1 = player(full, 'b1');
  const b2 = player(full, 'b2');

  assert.equal(full.finalTick, 300);
  assert.equal(full.roundsPlayed, 3);
  assert.equal(full.roundsCompleted, 3);
  assert.equal(a1.kills, 2);
  assert.equal(a1.totalDamage, 110);
  assert.equal(a1.adr, 110 / 3);
  assert.equal(a1.shotsFired, 3);
  assert.equal(a1.shotsHit, 2);
  assert.ok(Math.abs(a1.accuracy - (2 / 3) * 100) < 1e-10);
  assert.equal(a1.headshotPercent, 50);
  assert.equal(a1.headshotPercentExcludingAwp, 100);
  assert.equal(a1.bombsPlanted, 1);
  assert.equal(b1.bombsDefused, 1);
  assert.equal(a1.roundsSurvivedCount, 1);
  assert.equal(a2.roundsSurvivedCount, 2);
  assert.equal(b1.roundsSurvivedCount, 1);
  assert.equal(b2.roundsSurvivedCount, 3);
  assert.equal(a2.assists, 2);
  assert.equal(a2.flashAssists, 1);
  assert.equal(a2.utility.throws.flashbang, 2);
  assert.equal(a2.utility.flashesWithNoEnemyBlind, 1);
  assert.equal(a2.flashAssistPercent, 50);
  assert.equal(b1.utility.utilityDamageTotal, 30);
  assert.equal(b1.heDamage, 30);
  assert.equal(b2.utility.teamFlashes, 1);
});

test('keeps explicit logical teams, names, sides, and score stable across swaps', () => {
  const current = computeMatchStats(makeBundle(), 150);
  const alpha = current.teams.find((team) => team.id === 'TEAM_A');
  const bravo = current.teams.find((team) => team.id === 'TEAM_B');

  assert.ok(alpha);
  assert.ok(bravo);
  assert.equal(alpha.name, 'Alpha');
  assert.equal(bravo.name, 'Bravo');
  assert.equal(alpha.side, 'T');
  assert.equal(bravo.side, 'CT');
  assert.equal(alpha.score, 1);
  assert.equal(bravo.score, 0);
  assert.deepEqual(alpha.players.map((row) => row.steamId).sort(), ['a1', 'a2']);
  assert.equal(player(current, 'a1').teamId, player(current, 'a2').teamId);
  assert.notEqual(player(current, 'a1').teamId, player(current, 'b1').teamId);

  const full = computeMatchStats(makeBundle(), 300);
  assert.equal(full.teams.find((team) => team.id === 'TEAM_A').score, 1);
  assert.equal(full.teams.find((team) => team.id === 'TEAM_B').score, 2);
  assert.equal(full.teams.find((team) => team.id === 'TEAM_A').side, 'CT');
});

test('infers stable rosters for legacy bundles through halftime and overtime', () => {
  const legacy = makeBundle();
  delete legacy.teams;
  for (const row of legacy.players) delete row.teamId;
  for (const round of legacy.rounds) {
    delete round.ctTeamId;
    delete round.tTeamId;
  }
  for (const kill of legacy.tracks.kills) {
    delete kill.killerTeamId;
    delete kill.victimTeamId;
    delete kill.assisterTeamId;
  }

  const inferred = inferLogicalTeams(legacy);
  assert.equal(inferred.teamByPlayer.a1, inferred.teamByPlayer.a2);
  assert.equal(inferred.teamByPlayer.b1, inferred.teamByPlayer.b2);
  assert.notEqual(inferred.teamByPlayer.a1, inferred.teamByPlayer.b1);

  const current = computeMatchStats(legacy, 150);
  const aTeam = current.teams.find((team) => team.id === inferred.teamByPlayer.a1);
  assert.equal(aTeam.name, 'Alpha');
  assert.equal(aTeam.side, 'T');
  assert.equal(aTeam.score, 1);
});

test('handles missing tracks, clamps final tick, and does not mutate the bundle', () => {
  const bundle = {
    meta: { totalTicks: 10, tickRate: 64 },
    teams: [
      { id: 'TEAM_A', name: 'One', playerSteamIds: ['x'] },
      { id: 'TEAM_B', name: 'Two', playerSteamIds: ['y'] },
    ],
    players: [
      { steamId: 'x', name: 'X', teamId: 'TEAM_A' },
      { steamId: 'y', name: 'Y', teamId: 'TEAM_B' },
    ],
    rounds: [{ startTick: 0, endTick: 10, winner: 'CT', ctTeamId: 'TEAM_A', tTeamId: 'TEAM_B' }],
    tracks: {
      kills: [{ tick: 10, killerSteamId: 'x', victimSteamId: 'y', weapon: 'ak47' }],
      hurts: [],
      shots: [],
    },
  };
  const before = structuredClone(bundle);
  const result = computeMatchStats(bundle, 999);

  assert.equal(getFinalTick(bundle), 10);
  assert.equal(result.tick, 10);
  assert.equal(player(result, 'x').kills, 1);
  assert.equal(player(result, 'x').roundsSurvivedCount, 1);
  assert.equal(player(result, 'y').deaths, 1);
  assert.equal(player(result, 'y').roundsSurvivedCount, 0);
  assert.deepEqual(bundle, before);
});

