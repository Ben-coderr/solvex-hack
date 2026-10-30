// Prints what the reference detector does with every synthetic scenario, per sensor range and mount.
//   pnpm --filter @najda/detector report
import { SCENARIOS, makeTrace, replay, type Mount } from '../src';

const ranges = [4, 8, 16, 32];
const mounts: Mount[] = ['aligned', 'tilted', 'pocket'];
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

console.log('scenario'.padEnd(18), 'expect'.padEnd(9), ranges.map((r) => `±${r} g`.padEnd(14)).join(''));
for (const name of SCENARIOS) {
  const cells: string[] = [];
  let expect = '';
  for (const R of ranges) {
    let alerts = 0, n = 0, sat = 0, tsat = 0, dv = 0, unsupported = false;
    for (const mount of mounts) for (const seed of seeds) {
      const tr = makeTrace(name, { rangeG: R, seed, mount });
      expect = tr.expect;
      const res = replay(tr);
      n++;
      if (!res.supported) unsupported = true;
      const a = res.decisions.filter((d) => d.kind === 'alert');
      if (a.length) { alerts++; if (a[0]!.metrics.sensorLimited) sat++; tsat += a[0]!.metrics.tSaturatedMs; dv += a[0]!.metrics.dvKmh; }
    }
    cells.push((unsupported ? 'unsupported' : `${alerts}/${n}` + (alerts ? ` sat${sat} ${Math.round(tsat / alerts)}ms` : '')).padEnd(14));
  }
  console.log(name.padEnd(18), expect.padEnd(9), cells.join(''));
}
