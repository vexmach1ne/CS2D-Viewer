'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { RECORDED_CUES, WEAPON_ALIASES, buildAudioCatalog } = require('../src/main/audio-catalog.cjs');

test('audio catalog serves supplied OGG files for mapped combat and event cues', () => {
  const catalog = buildAudioCatalog();
  assert.equal(catalog.fileCount, 18);
  assert.equal(catalog.procedural, false);
  assert.equal(catalog.proceduralFallback, true);
  assert.equal(Object.keys(RECORDED_CUES).length, 18);
  assert.match(catalog.weapons.awp[0], /^viewer-asset:\/\/audio\/weapon-heavy\.ogg$/);
  assert.match(catalog.weapons['ak-47'][0], /^viewer-asset:\/\/audio\/weapon-rifle\.ogg$/);
  assert.match(catalog.weapons['glock-18'][0], /^viewer-asset:\/\/audio\/weapon-pistol\.ogg$/);
  assert.match(catalog.weapons.nova[0], /^viewer-asset:\/\/audio\/weapon-shotgun\.ogg$/);
  assert.equal(WEAPON_ALIASES.galil, 'galil ar');
  assert.equal(catalog.weapons.galil[0], catalog.weapons['galil ar'][0]);
  assert.equal(catalog.weapons.galilar[0], catalog.weapons['galil ar'][0]);
  assert.match(catalog.weapons.default[0], /^viewer-asset:\/\/audio\/weapon-rifle\.ogg$/);
  assert.match(catalog.groups.c4Explode[0], /^viewer-asset:\/\/audio\/c4-explode\.ogg$/);
  assert.match(catalog.groups.ctWin[0], /^viewer-asset:\/\/audio\/round-win-ct\.ogg$/);
  assert.match(catalog.groups.terWin[0], /^viewer-asset:\/\/audio\/round-win-t\.ogg$/);
  assert.match(catalog.groups.damageKevlar[0], /^viewer-asset:\/\/audio\/damage-hit\.ogg$/);
  assert.equal(catalog.groups.c4DefuseStart[0], 'procedural:c4DefuseStart');
});