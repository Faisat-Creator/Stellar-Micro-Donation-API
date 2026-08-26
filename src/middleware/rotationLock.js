/**
 * Rotation Lock Middleware
 *
 * Checks if a key rotation is in progress and returns HTTP 503 if so.
 * Used to prevent donations from being created with inconsistent encryption keys
 * during a key rotation operation.
 */

'use strict';

const Database = require('../utils/database');
const log = require('../utils/log');

const RETRY_AFTER_SECONDS = 5;

/**
 * Middleware that checks rotation status before allowing write operations
 * @param {string} keyName - The key being rotated (e.g., 'memoEncryption')
 * @returns {Function} Express middleware
 */
function rotationLockMiddleware(keyName = 'memoEncryption') {
  return async (req, res, next) => {
    try {
      const row = await Database.get(
        'SELECT status, startedAt FROM rotation_locks WHERE name = ?',
        [keyName]
      );

      if (row && row.status === 'in_progress') {
        log.warn('ROTATION_LOCK', `Key rotation in progress for ${keyName}`, {
          requestId: req.id,
          startedAt: row.startedAt,
          keyName,
        });

        return res
          .status(503)
          .set('Retry-After', String(RETRY_AFTER_SECONDS))
          .json({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Service temporarily unavailable due to key rotation',
            },
          });
      }

      next();
    } catch (err) {
      log.error('ROTATION_LOCK', 'Error checking rotation status', {
        error: err.message,
        keyName,
      });
      next(err);
    }
  };
}

/**
 * Get current rotation status for a key
 * @param {string} keyName
 * @returns {Promise<{status: string, startedAt: string|null, completedAt: string|null, error: string|null}>}
 */
async function getRotationStatus(keyName = 'memoEncryption') {
  const row = await Database.get(
    'SELECT status, startedAt, completedAt, error FROM rotation_locks WHERE name = ?',
    [keyName]
  );

  if (!row) {
    return { status: 'unknown', startedAt: null, completedAt: null, error: null };
  }

  return {
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    error: row.error,
  };
}

/**
 * Set rotation status
 * @param {string} keyName
 * @param {string} status - 'idle', 'in_progress', or 'failed'
 * @param {Object} options
 * @param {string} [options.error] - Error message if status is 'failed'
 */
async function setRotationStatus(keyName = 'memoEncryption', status, options = {}) {
  const { error } = options;

  const updates = {
    status,
    updatedAt: new Date().toISOString(),
  };

  if (status === 'in_progress') {
    updates.startedAt = new Date().toISOString();
    updates.completedAt = null;
    updates.error = null;
  } else if (status === 'idle') {
    updates.completedAt = new Date().toISOString();
    updates.error = null;
  } else if (status === 'failed') {
    updates.completedAt = new Date().toISOString();
    updates.error = error || 'Unknown error';
  }

  const setClauses = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);

  await Database.run(
    `UPDATE rotation_locks SET ${setClauses} WHERE name = ?`,
    [...values, keyName]
  );
}

module.exports = {
  rotationLockMiddleware,
  getRotationStatus,
  setRotationStatus,
};
