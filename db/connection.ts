/**
 * Shared SQLite Database Connection
 *
 * Provides a module-level singleton so that both bot handlers and API routes
 * can access the same database without requiring a Fastify instance.
 *
 * The connection is lazily created on first call to getDb() and reused for
 * the lifetime of the process.  WAL mode is enabled for concurrent readers.
 *
 * If the database file or its parent directory do not exist they are created
 * automatically.
 *
 * Usage:
 *   import { getDb } from '../db/connection.js';
 *   const db = getDb();
 *   const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
 *
 * @module db/connection
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let db: InstanceType<typeof Database> | null = null;

/**
 * Return the shared SQLite database handle.
 * Creates the database file + directory on first call if they don't exist.
 */
export function getDb(): InstanceType<typeof Database> {
  if (!db) {
    const dbPath =
      process.env.DATABASE_PATH ||
      path.join(process.cwd(), 'data', 'kin.db');

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Apply schema if the projects table is missing (first-run safety net).
    // Full schema application is handled by scripts/start.ts — this is a
    // lightweight guard so that bot handlers can work even when started
    // outside the normal startup flow.
    const hasProjectsTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
      )
      .get();

    if (!hasProjectsTable) {
      const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
      }
    }
  }

  return db;
}

/**
 * Close the shared database connection.
 * Mostly useful in tests or graceful-shutdown hooks.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
