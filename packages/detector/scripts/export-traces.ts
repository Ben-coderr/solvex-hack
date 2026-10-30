// Writes replay CSVs + manifest for the app's replay engine (M3) and the /phones demo page (D11).
//   pnpm --filter @sellekni/detector traces
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS, makeTrace, replay, toCsv } from '../src';

const out = join(import.meta.dirname, '..', 'traces');
mkdirSync(out, { recursive: true });
const manifest: unknown[] = [];
for (const rangeG of [8, 16, 200]) for (const name of SCENARIOS) {
  if (rangeG === 200 && !(name === 'frontal_45' || name === 'rollover_71')) continue; // BOX replays: the two crash scenarios only
  const tr = makeTrace(name, { rangeG, seed: 1, mount: 'tilted' });
  const file = `${name}_r${rangeG}.csv`;
  writeFileSync(join(out, file), toCsv(tr));
  const res = replay(tr);
  manifest.push({
    file, scenario: name, rangeG, rateHz: tr.rateHz, durationS: tr.samples.length / tr.rateHz, expect: tr.expect, note: tr.note,
    synthetic: true, label: rangeG === 200 ? 'REPLAY · SYNTHETIC · BOX (simulated, roadmap)' : 'REPLAY · SYNTHETIC',
    detector: res.decisions.map((d) => ({ kind: d.kind, rule: d.rule, reasons: d.reasons, rejected: d.rejected, metrics: d.metrics })),
  });
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${manifest.length} traces to ${out}`);
