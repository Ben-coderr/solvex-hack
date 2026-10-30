import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { OutboxItem, OutboxStore } from '../alert/outbox';

/** Persistent outbox: one row per alert, written BEFORE any channel runs; survives app kill and reboot. */
let db: Promise<SQLiteDatabase> | null = null;

function open(): Promise<SQLiteDatabase> {
  db ??= openDatabaseAsync('najda.db').then(async (d) => {
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        item TEXT NOT NULL
      );`);
    return d;
  });
  return db;
}

export const sqliteOutbox: OutboxStore = {
  async put(item) {
    const d = await open();
    await d.runAsync('INSERT OR REPLACE INTO outbox (id, created_at, item) VALUES (?, ?, ?)', item.id, item.createdAt, JSON.stringify(item));
  },
  async get(id) {
    const d = await open();
    const row = await d.getFirstAsync<{ item: string }>('SELECT item FROM outbox WHERE id = ?', id);
    return row ? (JSON.parse(row.item) as OutboxItem) : null;
  },
  async list() {
    const d = await open();
    const rows = await d.getAllAsync<{ item: string }>('SELECT item FROM outbox ORDER BY created_at DESC LIMIT 50');
    return rows.map((r) => JSON.parse(r.item) as OutboxItem);
  },
};
