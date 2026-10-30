import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWithLegacy, rowsToCopy, STORAGE } from '../src/state/legacy';

test('settings: the new key wins; the old key is read only when the new one is missing', () => {
  const kv = new Map<string, string>([[STORAGE.legacySettings, '{"state":{"serverUrl":"http://old"}}']]);
  const get = (k: string) => kv.get(k) ?? null;
  assert.equal(readWithLegacy(get, STORAGE.settings, STORAGE.legacySettings), '{"state":{"serverUrl":"http://old"}}');
  kv.set(STORAGE.settings, '{"state":{"serverUrl":"http://new"}}');
  assert.equal(readWithLegacy(get, STORAGE.settings, STORAGE.legacySettings), '{"state":{"serverUrl":"http://new"}}');
  assert.equal(readWithLegacy(() => null, STORAGE.settings, STORAGE.legacySettings), null);
});

test('outbox: copies only the alerts the new database does not hold', () => {
  const old = [
    { id: 'A1B2C', created_at: 1, item: '{}' },
    { id: 'K7Q2M', created_at: 2, item: '{}' },
  ];
  assert.deepEqual(rowsToCopy(old, new Set(['K7Q2M'])).map((r) => r.id), ['A1B2C']);
  assert.deepEqual(rowsToCopy(old, new Set(['A1B2C', 'K7Q2M'])), []);
});
