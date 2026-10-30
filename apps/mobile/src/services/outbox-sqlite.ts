import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { normalizeItem, type OutboxItem, type OutboxStore } from '../alert/outbox';
import { rowsToCopy, STORAGE, type OutboxRow } from '../state/legacy';

/** Persistent outbox: one row per alert, written BEFORE any channel runs; survives app kill and reboot. */
let db: Promise<SQLiteDatabase> | null = null;

function open(): Promise<SQLiteDatabase> {
  db ??= openDatabaseAsync(STORAGE.outboxDb).then(async (d) => {
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        item TEXT NOT NULL
      );`);
    await importLegacy(d);
    return d;
  });
  return db;
}

/** Once per install (user_version 0 → 1): alerts saved by a build from before the rename move to the new database. */
async function importLegacy(d: SQLiteDatabase) {
  const v = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((v?.user_version ?? 0) >= 1) return;
  try {
    const old = await openDatabaseAsync(STORAGE.legacyOutboxDb);
    const rows = await old.getAllAsync<OutboxRow>('SELECT id, created_at, item FROM outbox');
    const have = new Set((await d.getAllAsync<{ id: string }>('SELECT id FROM outbox')).map((r) => r.id));
    for (const r of rowsToCopy(rows, have)) {
      await d.runAsync('INSERT OR IGNORE INTO outbox (id, created_at, item) VALUES (?, ?, ?)', r.id, r.created_at, r.item);
    }
    await old.closeAsync();
  } catch {
    // no old database or no outbox table in it: nothing to import
  }
  await d.execAsync('PRAGMA user_version = 1');
}

export const sqliteOutbox: OutboxStore = {
  async put(item) {
    const d = await open();
    await d.runAsync('INSERT OR REPLACE INTO outbox (id, created_at, item) VALUES (?, ?, ?)', item.id, item.createdAt, JSON.stringify(item));
  },
  async get(id) {
    const d = await open();
    const row = await d.getFirstAsync<{ item: string }>('SELECT item FROM outbox WHERE id = ?', id);
    return row ? normalizeItem(JSON.parse(row.item) as OutboxItem) : null;
  },
  async list() {
    const d = await open();
    const rows = await d.getAllAsync<{ item: string }>('SELECT item FROM outbox ORDER BY created_at DESC LIMIT 50');
    return rows.map((r) => normalizeItem(JSON.parse(r.item) as OutboxItem));
  },
};
