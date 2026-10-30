import { describe, expect, it } from 'vitest';
import type { HospitalRecord } from '@sellekni/shared';
import { rankingCandidates } from './candidates';

const h = (id: string, lat: number, level: 'A' | 'B' = 'B'): HospitalRecord =>
  ({ id, name: id, level, lat, lon: 3, capabilities: ['ed24'] });

describe('rankingCandidates', () => {
  it('leaves a small set alone (the demo worked example)', () => {
    const set = [h('a', 36), h('b', 35), h('c', 34, 'A')];
    expect(rankingCandidates(set, { lat: 36, lon: 3 })).toEqual(set);
  });

  it('keeps the nearest N plus the nearest Level-A ones even when far, closest first', () => {
    const near = Array.from({ length: 20 }, (_, i) => h(`b${i}`, 36 - i * 0.01));
    const far = [h('A-far', 30, 'A'), h('A-farther', 25, 'A'), h('A-near', 35.9, 'A'), h('A-farthest', 20, 'A')];
    const ids = rankingCandidates([...far, ...near], { lat: 36, lon: 3 }, 5, 3).map((x) => x.id);
    expect(ids).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'A-near', 'A-far', 'A-farther']);
  });
});
