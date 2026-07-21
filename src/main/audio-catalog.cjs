const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = Object.freeze({
  master: 1,
  groups: {
    weapons: 0.9,
    bombPlant: 0.85,
    bombDefuse: 0.9,
    bombBeepA: 0.75,
    bombBeepATen: 0.78,
    bombBeepB: 0.75,
    bombBeepBTen: 0.78,
    c4Initiate: 0.8,
    c4PlantFinish: 0.85,
    c4DefuseStart: 0.82,
    c4DefuseFinish: 0.9,
    c4Explode: 0.95,
    roundWin: 0.9,
    flashExplode: 0.85,
    smoke: 0.6,
    smokeEmit: 0.55,
    molotov: 0.75,
    molotovLoop: 0.65,
    molotovLoopFade: 0.62,
    molotovExtinguish: 0.72,
    heExplode: 0.85,
    damageKevlar: 0.65,
    damageBurn: 0.68,
    damageHeadshot: 0.85,
    doorOpen: 0.45,
  },
  weapons: { default: 1, distant: 1, close: 1, awp: 1, pistols: 1 },
  damageCooldownMs: 500,
});

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function listFiles(rootDir) {
  const output = [];
  if (!fs.existsSync(rootDir)) return output;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && /\.(wav|mp3|ogg)$/i.test(entry.name)) output.push(fullPath);
    }
  };
  walk(rootDir);
  return output;
}

function encodeAssetUrl(relativePath) {
  const segments = String(relativePath).split('/').filter(Boolean).map(encodeURIComponent);
  return `viewer-asset://audio/2Dviewer/${segments.join('/')}`;
}

function buildAudioCatalog(assetRoot) {
  const audioRoot = path.join(assetRoot, 'audio', '2Dviewer');
  const config = readJsonSafe(path.join(assetRoot, 'audio', 'audio-config.json'), DEFAULT_CONFIG) || DEFAULT_CONFIG;
  const files = listFiles(audioRoot).map((fullPath) => {
    const relative = path.relative(audioRoot, fullPath).split(path.sep).join('/');
    const parts = relative.split('/');
    return { relative, folder: parts.length > 1 ? parts[0].toLowerCase() : '', name: parts.at(-1), url: encodeAssetUrl(relative) };
  });

  const byFolder = new Map();
  for (const file of files) {
    if (!byFolder.has(file.folder)) byFolder.set(file.folder, []);
    byFolder.get(file.folder).push(file);
  }
  for (const rows of byFolder.values()) rows.sort((a, b) => a.name.localeCompare(b.name));

  const pickWeaponShots = (folder, include = /distant/i, fallback = /(?:[_-]\d+|_0\d+)\.(wav|mp3|ogg)$/i, exclude = null) => {
    const rows = (byFolder.get(folder) || []).filter((row) => !(exclude && exclude.test(row.name)));
    const preferred = rows.filter((row) => include.test(row.name));
    const selected = preferred.length ? preferred : rows.filter((row) => fallback.test(row.name));
    return [...new Map(selected.map((row) => [row.name, row.url])).values()];
  };

  const folderMap = {
    'ak-47': 'ak47', aug: 'aug', awp: 'awp', 'pp-bizon': 'bizon', 'cz75-auto': 'cz75a',
    'desert eagle': 'deagle', 'dual berettas': 'elite', famas: 'famas', 'five-seven': 'fiveseven',
    g3sg1: 'g3sg1', 'galil ar': 'galilar', 'glock-18': 'glock18', m249: 'm249', 'mac-10': 'mac10',
    'mag-7': 'mag7', 'mp5-sd': 'mp5', mp7: 'mp7', mp9: 'mp9', negev: 'negev', nova: 'nova',
    p2000: 'hkp2000', p250: 'p250', p90: 'p90', 'r8 revolver': 'revolver', 'sawed-off': 'sawedoff',
    'scar-20': 'scar20', 'sg 553': 'sg556', 'ssg 08': 'ssg08', 'tec-9': 'tec9', 'ump-45': 'ump45',
    'usp-s': 'usp', xm1014: 'xm1014',
  };
  const weapons = {};
  for (const [weapon, folder] of Object.entries(folderMap)) {
    const urls = pickWeaponShots(folder);
    if (urls.length) weapons[weapon] = urls;
  }
  const m4Rows = byFolder.get('m4a1') || [];
  weapons['m4a1-s'] = m4Rows.filter((row) => /m4a1_us_distant/i.test(row.name)).map((row) => row.url);
  weapons.m4a4 = m4Rows.filter((row) => /m4a1_distant/i.test(row.name) && !/m4a1_us/i.test(row.name)).map((row) => row.url);
  const uspSilenced = (byFolder.get('usp') || []).filter((row) => /^usp_0[1-3]\.wav$/i.test(row.name)).map((row) => row.url);
  if (uspSilenced.length) weapons['usp-s'] = uspSilenced;

  const pickGroup = (predicate) => files.filter(predicate).map((row) => row.url);
  const groups = {
    bombPlant: pickGroup((row) => /^bombpl\.wav$/i.test(row.name)),
    bombDefuse: pickGroup((row) => /^bombdef\.wav$/i.test(row.name)),
    c4Initiate: pickGroup((row) => /^c4_initiate\.wav$/i.test(row.name)),
    c4PlantFinish: pickGroup((row) => /^c4_plant_quiet\.wav$/i.test(row.name)),
    c4DefuseStart: pickGroup((row) => /^c4_disarmstart\.wav$/i.test(row.name)),
    c4DefuseFinish: pickGroup((row) => /^c4_disarmfinish\.wav$/i.test(row.name)),
    c4Explode: pickGroup((row) => row.folder === 'c4' && /^c4_explode1\.wav$/i.test(row.name)),
    bombBeepA: pickGroup((row) => row.folder === 'c4' && /^c4_beep2\.wav$/i.test(row.name)),
    bombBeepATen: pickGroup((row) => row.folder === 'c4' && /^c4_beep2_10sec\.wav$/i.test(row.name)),
    bombBeepB: pickGroup((row) => row.folder === 'c4' && /^c4_beep3\.wav$/i.test(row.name)),
    bombBeepBTen: pickGroup((row) => row.folder === 'c4' && /^c4_beep3_10sec\.wav$/i.test(row.name)),
    ctWin: pickGroup((row) => /^ctwin\.wav$/i.test(row.name)),
    terWin: pickGroup((row) => /^terwin\.wav$/i.test(row.name)),
    flashExplode: pickGroup((row) => row.folder === 'flashbang' && /^flashbang_explode\d+_distant\.(wav|mp3|ogg)$/i.test(row.name)),
    smoke: pickGroup((row) => row.folder === 'smokegrenade' && /^sg_explode_distant\.(wav|mp3|ogg)$/i.test(row.name)),
    smokeEmit: pickGroup((row) => row.folder === 'smokegrenade' && /^smoke_emit\.(wav|mp3|ogg)$/i.test(row.name)),
    molotov: pickGroup((row) =>
      (row.folder === 'molotov' && /^molotov_detonate_\d+_distant\.(wav|mp3|ogg)$/i.test(row.name)) ||
      (row.folder === 'incgrenade' && /^inc_grenade_detonate_\d+_distant\.(wav|mp3|ogg)$/i.test(row.name))),
    molotovLoop: pickGroup((row) => row.folder === 'molotov' && /^fire_loop_1\.(wav|mp3|ogg)$/i.test(row.name)),
    molotovLoopFade: pickGroup((row) => row.folder === 'molotov' && /^fire_loop_fadeout_01\.(wav|mp3|ogg)$/i.test(row.name)),
    molotovExtinguish: pickGroup((row) => row.folder === 'molotov' && /^molotov_extinguish\.(wav|mp3|ogg)$/i.test(row.name)),
    heExplode: pickGroup((row) => row.folder === 'hegrenade' && /^hegrenade_distant_detonate_\d+\.(wav|mp3|ogg)$/i.test(row.name)),
    damageKevlar: pickGroup((row) => /^(kevlar[1-5]|kevlar_0?1)\.wav$/i.test(row.name)),
    damageBurn: pickGroup((row) => /^burn_damage\d+\.wav$/i.test(row.name)),
    damageHeadshot: pickGroup((row) => /^headshot_armor_flesh\.wav$/i.test(row.name)),
    doorOpen: pickGroup((row) => /^metal_door_open_\d+\.wav$/i.test(row.name)),
  };
  if (!groups.damageKevlar.length) {
    groups.damageKevlar = pickGroup((row) => row.relative.startsWith('fx/nearmiss/') && /bulletby_subsonic_\d+/i.test(row.name));
  }
  return { config, weapons, groups, fileCount: files.length };
}

module.exports = { DEFAULT_CONFIG, buildAudioCatalog, encodeAssetUrl };
