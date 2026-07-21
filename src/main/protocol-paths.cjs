const path = require('node:path');

const ASSET_RULES = Object.freeze({
  maps: new Set(['.png', '.webp', '.jpg', '.jpeg']),
  icons: new Set(['.svg', '.png', '.webp']),
  vfx: new Set(['.svg', '.png', '.webp', '.gif']),
  audio: new Set(['.wav', '.mp3', '.ogg', '.m4a']),
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isWithinDirectory(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveAllowedAssetPath(assetRoot, rawUrl) {
  const rawValue = String(rawUrl || '');
  if (/%2e|%2f|%5c/i.test(rawValue)) return null;
  let parsed;
  try {
    parsed = rawUrl instanceof URL ? rawUrl : new URL(rawValue);
  } catch (_error) {
    return null;
  }
  if (parsed.protocol !== 'viewer-asset:') return null;
  const category = parsed.hostname.toLowerCase();
  const allowedExtensions = ASSET_RULES[category];
  if (!allowedExtensions) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  } catch (_error) {
    return null;
  }
  if (!relativePath || relativePath.includes('\0') || relativePath.includes('\\')) return null;
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;

  const categoryRoot = path.resolve(assetRoot, category);
  const candidate = path.resolve(categoryRoot, ...segments);
  const extension = path.extname(candidate).toLowerCase();
  if (!isWithinDirectory(categoryRoot, candidate) || !allowedExtensions.has(extension)) return null;
  return candidate;
}

function validateStatePatchPayload(value) {
  if (!isPlainObject(value)) throw new TypeError('State patch must be an object.');
  const allowedKeys = new Set(['playback', 'preferences']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new TypeError(`Unsupported state patch field: ${key}`);
  }
  if (value.playback !== undefined && !isPlainObject(value.playback)) {
    throw new TypeError('Playback state must be an object.');
  }
  if (value.preferences !== undefined && !isPlainObject(value.preferences)) {
    throw new TypeError('Preferences state must be an object.');
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_error) {
    throw new TypeError('State patch must be JSON serializable.');
  }
  if (Buffer.byteLength(serialized || '', 'utf8') > 128 * 1024) {
    throw new RangeError('State patch exceeds the maximum size.');
  }
  return value;
}

module.exports = {
  ASSET_RULES,
  isPlainObject,
  isWithinDirectory,
  resolveAllowedAssetPath,
  validateStatePatchPayload,
};
