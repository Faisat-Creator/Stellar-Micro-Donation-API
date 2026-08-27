/**
 * Migration 040: Add rotation lock tracking table
 *
 * Creates a table to track encryption key rotation state, allowing the API
 * to safely reject donation writes during a key rotation operation.
 *
 * The `rotation_locks` table stores per-key rotation state with:
 * - name: identifier for the rotating key (e.g., 'memoEncryption', 'userEncryption')
 * - status: 'idle', 'in_progress', or 'failed'
 * - startedAt: when the rotation began
 * - completedAt: when it finished (null if still running or failed)
 * - error: descriptive error message if status is 'failed'
 *
 * The API middleware checks this table before accepting donations and returns
 * HTTP 503 Service Unavailable with Retry-After header if rotation is in progress.
 */

module.exports = {
  name: '040_rotation_lock',

  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS rotation_locks (
        name TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'idle',
        startedAt TEXT,
        completedAt TEXT,
        error TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO rotation_locks (name, status, createdAt, updatedAt)
      VALUES ('memoEncryption', 'idle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
  },

  async down(db) {
    await db.exec('DROP TABLE IF EXISTS rotation_locks');
  },
};
