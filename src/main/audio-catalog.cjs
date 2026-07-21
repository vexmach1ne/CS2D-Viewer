/**
 * User-supplied OGG sound catalog. Cues without a supplied recording retain a
 * procedural fallback so the viewer remains functional for every event type.
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

/**
 * Parser output is mostly CS internal names, whereas the display catalog keeps
 * human-readable names. Keep both spellings pointed at the same cue so a
 * valid shot never becomes silent merely because its name differs.
 */
const WEAPON_ALIASES = Object.freeze({
  ak47: 'ak-47', 'ak 47': 'ak-47',
  galil: 'galil ar', galilar: 'galil ar',
  deagle: 'desert eagle', 'desert-eagle': 'desert eagle',
  elite: 'dual berettas', 'dual-berettas': 'dual berettas',
  fiveseven: 'five-seven', 'five seven': 'five-seven',
  hkp2000: 'p2000',
  mac10: 'mac-10', mag7: 'mag-7',
  mp5: 'mp5-sd', mp5sd: 'mp5-sd',
  ppbizon: 'pp-bizon', bizon: 'pp-bizon',
  r8: 'r8 revolver', revolver: 'r8 revolver',
  scar20: 'scar-20', 'scar 20': 'scar-20',
  sg553: 'sg 553', krieg: 'sg 553',
  ssg08: 'ssg 08', scout: 'ssg 08',
  ump: 'ump-45', ump45: 'ump-45',
  m4a1s: 'm4a1-s', 'm4a1 silencer': 'm4a1-s',
  usps: 'usp-s', usp: 'usp-s', 'usp silencer': 'usp-s',
  cz75a: 'cz75-auto',
});

const RECORDED_CUES = Object.freeze({
  c4Explode: 'c4-explode.ogg', c4Initiate: 'c4-plant-start.ogg', c4PlantFinish: 'c4-plant-finish.ogg',
  damageBurn: 'damage-burn.ogg', damageHeadshot: 'damage-headshot.ogg', damageKevlar: 'damage-hit.ogg',
  doorOpen: 'door-open.ogg', flashExplode: 'flash-explode.ogg', heExplode: 'he-explode.ogg',
  molotovExtinguish: 'molotov-extinguish.ogg', molotov: 'molotov-ignite.ogg', ctWin: 'round-win-ct.ogg',
  terWin: 'round-win-t.ogg', smoke: 'smoke-deploy.ogg', 'weapon-heavy': 'weapon-heavy.ogg',
  'weapon-pistol': 'weapon-pistol.ogg', 'weapon-rifle': 'weapon-rifle.ogg', 'weapon-shotgun': 'weapon-shotgun.ogg',
});

function assetUrl(file) {
  return `viewer-asset://audio/${encodeURIComponent(file)}`;
}

function cue(name) {
  return RECORDED_CUES[name] ? assetUrl(RECORDED_CUES[name]) : `procedural:${name}`;
}

function weaponPreset(weapon) {
  if (['awp', 'g3sg1', 'scar-20', 'ssg 08'].includes(weapon)) return cue('weapon-heavy');
  if (['mag-7', 'nova', 'sawed-off', 'xm1014'].includes(weapon)) return cue('weapon-shotgun');
  if (['desert eagle', 'r8 revolver', 'p2000', 'p250', 'five-seven', 'glock-18', 'tec-9', 'usp-s', 'cz75-auto', 'dual berettas'].includes(weapon)) return cue('weapon-pistol');
  return cue('weapon-rifle');
}

function buildAudioCatalog(_assetRoot) {
  const weapons = Object.fromEntries(WEAPONS.map((weapon) => [weapon, [weaponPreset(weapon)]]));
  for (const [alias, canonical] of Object.entries(WEAPON_ALIASES)) weapons[alias] = weapons[canonical];
  // A parser can encounter weapons added after this app release. Do not make
  // those events silent; the rifle cue is the least surprising fallback.
  weapons.default = [cue('weapon-rifle')];
  const groupNames = [
    'bombPlant', 'bombDefuse', 'bombBeepA', 'bombBeepATen', 'bombBeepB', 'bombBeepBTen',
    'c4Initiate', 'c4PlantFinish', 'c4DefuseStart', 'c4DefuseFinish', 'c4Explode', 'ctWin',
    'terWin', 'flashExplode', 'smoke', 'smokeEmit', 'molotov', 'molotovLoop', 'molotovLoopFade',
    'molotovExtinguish', 'heExplode', 'damageKevlar', 'damageBurn', 'damageHeadshot', 'doorOpen',
  ];
  const aliases = { bombPlant: 'c4PlantFinish', smokeEmit: 'smoke' };
  const groups = Object.fromEntries(groupNames.map((name) => [name, [cue(aliases[name] || name)]]));
  return { config: DEFAULT_CONFIG, weapons, groups, fileCount: Object.keys(RECORDED_CUES).length, procedural: false, proceduralFallback: true };
}

module.exports = { DEFAULT_CONFIG, RECORDED_CUES, WEAPON_ALIASES, buildAudioCatalog };