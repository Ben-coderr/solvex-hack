/**
 * Storage names before the codename rename (24h-H5). A phone that ran an older build keeps its settings and
 * its outbox: the new name is read first, the old one once as a fallback, and the next write lands under the new name.
 */
export const STORAGE = {
  settings: 'sellekni.settings.v1',
  legacySettings: 'najda.settings.v1',
  outboxDb: 'sellekni.db',
  legacyOutboxDb: 'najda.db',
} as const;

export function readWithLegacy(get: (key: string) => string | null, key: string, legacy: string): string | null {
  return get(key) ?? get(legacy);
}

export interface OutboxRow { id: string; created_at: number; item: string }

/** Rows of the old outbox to copy: those the new one does not already hold (a re-run copies nothing). */
export const rowsToCopy = (old: OutboxRow[], existingIds: ReadonlySet<string>) => old.filter((r) => !existingIds.has(r.id));
