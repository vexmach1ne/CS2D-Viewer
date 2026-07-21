/**
 * Original, procedural sound catalog. The renderer synthesizes each cue with
 * Web Audio rather than shipping recorded game sounds.
 */
const DEFAULT_CONFIG = Object.freeze({
  master: 1,
  groups: {
    weapons: 0.42, bombPlant: 0.45, bombDefuse: 0.45, bombBeepA: 0.35,
    bombBeepATen: 0.35, bombBeepB: 0.35, bombBeepBTen: 0.35, c4Initiate: 0.4,
    c4PlantFinish: 0.45, c4DefuseStart: 0.4, c4DefuseFinish: 0.45, c4Explode: 0.5,
    ctWin: 0.35, terWin: 0.35, roundWin: 0.35, flashExplode: 0.35, smoke: 0.3,
    smokeEmit: 0.3, molotov: 0.35, molotovLoop: 0.25, molotovLoopFade: 0.2,
    molotovExtinguish: 0.3, heExplode: 0.42, damageKevlar: 0.28, damageBurn: 0.28,
    damageHeadshot: 0.32, doorOpen: 0.3,
  },
  weapons: { default: 1, distant: 1, close: 1, awp: 1, pistols: 1 },
  damageCooldownMs: 500,
});

const WEAPONS = [
  'ak-47', 'aug', 'awp', 'pp-bizon', 'cz75-auto', 'desert eagle', 'dual berettas',
  'famas', 'five-seven', 'g3sg1', 'galil ar', 'glock-18', 'm249', 'm4a1-s', 'm4a4',
  'mac-10', 'mag-7', 'mp5-sd', 'mp7', 'mp9', 'negev', 'nova', 'p2000', 'p250', 'p90',
  'r8 revolver', 'sawed-off', 'scar-20', 'sg 553', 'ssg 08', 'tec-9', 'ump-45', 'usp-s', 'xm1014',
];

function weaponPreset(weapon) {
  if (['awp', 'g3sg1', 'scar-20', 'ssg 08'].includes(weapon)) return 'procedural:weapon-heavy';
  if (['mag-7', 'nova', 'sawed-off', 'xm1014'].includes(weapon)) return 'procedural:weapon-shotgun';
  if (['desert eagle', 'r8 revolver', 'p2000', 'p250', 'five-seven', 'glock-18', 'tec-9', 'usp-s', 'cz75-auto', 'dual berettas'].includes(weapon)) return 'procedural:weapon-pistol';
  return 'procedural:weapon-rifle';
}

function buildAudioCatalog(_assetRoot) {
  const weapons = Object.fromEntries(WEAPONS.map((weapon) => [weapon, [weaponPreset(weapon)]]));
  const groups = Object.fromEntries([
    'bombPlant', 'bombDefuse', 'bombBeepA', 'bombBeepATen', 'bombBeepB', 'bombBeepBTen',
    'c4Initiate', 'c4PlantFinish', 'c4DefuseStart', 'c4DefuseFinish', 'c4Explode', 'ctWin',
    'terWin', 'flashExplode', 'smoke', 'smokeEmit', 'molotov', 'molotovLoop', 'molotovLoopFade',
    'molotovExtinguish', 'heExplode', 'damageKevlar', 'damageBurn', 'damageHeadshot', 'doorOpen',
  ].map((name) => [name, ['procedural:' + name]]));
  return { config: DEFAULT_CONFIG, weapons, groups, fileCount: 0, procedural: true };
}

module.exports = { DEFAULT_CONFIG, buildAudioCatalog };