import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { CalendarEvent, EventType, StorableEvent } from '../types';

const DATA_DIR = process.env.DATA_DIR ?? process.cwd();
const DB_PATH = path.join(DATA_DIR, 'timezones.db');

let db: Database.Database;

interface CountRow {
  n: number;
}

interface EventRow {
  id: string;
  name: string;
  type: string;
  scheduled_start_at: number | null;
  scheduled_end_at: number | null;
}

interface TimezoneRow {
  timezone: string;
}

export function initDb(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Database path: ${DB_PATH}`);
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_timezones (
      user_id TEXT PRIMARY KEY,
      timezone TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_history (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      type               TEXT NOT NULL DEFAULT 'cancelled',
      scheduled_start_at INTEGER,
      scheduled_end_at   INTEGER
    );
  `);

  const old = (
    db
      .prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='cancelled_events'")
      .get() as CountRow
  ).n;
  if (old) {
    db.exec(`
      INSERT OR IGNORE INTO event_history (id, name, type, scheduled_start_at, scheduled_end_at)
        SELECT id, name, 'cancelled', scheduled_start_at, scheduled_end_at FROM cancelled_events;
      DROP TABLE cancelled_events;
    `);
    console.log('Migrated cancelled_events -> event_history');
  }
}

export function storeEventHistory(event: StorableEvent, type: EventType = 'cancelled'): void {
  db
    .prepare(
      `INSERT OR REPLACE INTO event_history (id, name, type, scheduled_start_at, scheduled_end_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.name,
      type,
      event.scheduledStartAt?.getTime() ?? null,
      event.scheduledEndAt?.getTime() ?? null,
    );
}

export function storeCancelledEvent(event: StorableEvent): void {
  storeEventHistory(event, 'cancelled');
}

export function getEventHistory(): CalendarEvent[] {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return (db.prepare('SELECT * FROM event_history WHERE scheduled_start_at > ?').all(cutoff) as EventRow[]).map(
    (row) => ({
      id: row.id,
      name: row.name,
      status: row.type === 'cancelled' ? 4 : 3,
      type: row.type as EventType,
      scheduledStartAt: row.scheduled_start_at ? new Date(row.scheduled_start_at) : null,
      scheduledEndAt: row.scheduled_end_at ? new Date(row.scheduled_end_at) : null,
      recurrenceRule: null,
    }),
  );
}

export function getTimezone(userId: string): string | null {
  const row = db
    .prepare('SELECT timezone FROM user_timezones WHERE user_id = ?')
    .get(userId) as TimezoneRow | undefined;
  return row ? row.timezone : null;
}

export function setTimezone(userId: string, timezone: string): void {
  db.prepare('INSERT OR REPLACE INTO user_timezones (user_id, timezone) VALUES (?, ?)').run(userId, timezone);
}

export function getDistinctTimezones(): string[] {
  return (db.prepare('SELECT DISTINCT timezone FROM user_timezones').all() as TimezoneRow[]).map((r) => r.timezone);
}
