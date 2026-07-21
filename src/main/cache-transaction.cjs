'use strict';

const fs = require('node:fs');
const path = require('node:path');

function removeBestEffort(fsOps, filePath) {
  try { fsOps.unlinkSync(filePath); } catch (_error) { /* Transaction cleanup only. */ }
}

/**
 * Commit a validated temporary cache. The normal same-volume path is an atomic
 * replace. The fallback keeps a backup until the replacement is complete.
 *
 * @param {string} temporaryPath
 * @param {string} finalPath
 * @param {any} [fsOps]
 */
function commitTemporaryCache(temporaryPath, finalPath, fsOps = fs) {
  const temporary = path.resolve(temporaryPath);
  const final = path.resolve(finalPath);
  if (temporary === final || path.dirname(temporary) !== path.dirname(final)) {
    throw new Error('Temporary and final caches must be distinct files in the same directory.');
  }

  try {
    fsOps.renameSync(temporary, final);
    return;
  } catch (renameError) {
    const backup = `${final}.previous-${process.pid}-${Date.now()}`;
    const hadPrevious = fsOps.existsSync(final);
    try {
      if (hadPrevious) fsOps.copyFileSync(final, backup, fs.constants.COPYFILE_EXCL);
      fsOps.copyFileSync(temporary, final);
      removeBestEffort(fsOps, temporary);
      removeBestEffort(fsOps, backup);
    } catch (commitError) {
      if (hadPrevious && fsOps.existsSync(backup)) {
        try { fsOps.copyFileSync(backup, final); } catch (_restoreError) { /* Surface the original commit failure. */ }
      } else if (!hadPrevious) {
        removeBestEffort(fsOps, final);
      }
      removeBestEffort(fsOps, backup);
      throw commitError instanceof Error ? commitError : renameError;
    }
  }
}

module.exports = { commitTemporaryCache };
