import { Detector } from './detector';
import type { Decision, DetectorState, GpsFix, Sample, Trace } from './types';

export interface ReplayResult { decisions: Decision[]; finalState: DetectorState; supported: boolean }

/** Feed a trace through the SAME detector the phone runs. Samples and GPS fixes are merged by time. */
export function replay(trace: Pick<Trace, 'samples' | 'gps' | 'rangeG'>, det = new Detector(trace.rangeG)): ReplayResult {
  const out: Decision[] = [];
  let g = 0;
  for (const s of trace.samples) {
    while (g < trace.gps.length && trace.gps[g]!.t <= s.t) out.push(...det.pushGps(trace.gps[g++]!));
    out.push(...det.pushSample(s));
  }
  while (g < trace.gps.length) out.push(...det.pushGps(trace.gps[g++]!));
  return { decisions: out, finalState: det.state, supported: det.supported };
}

const HEADER = 't_ms,ax,ay,az,gx,gy,gz,speed_kmh';
/** CSV used by the Sensor Lab (M9) and the replay engine (M3). speed_kmh is filled only on rows where a GPS fix arrives. */
export function toCsv(trace: Pick<Trace, 'samples' | 'gps'>): string {
  const rows: string[] = [HEADER];
  let g = 0;
  for (const s of trace.samples) {
    let sp = '';
    while (g < trace.gps.length && trace.gps[g]!.t <= s.t) sp = String(trace.gps[g++]!.speedKmh);
    rows.push([s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, sp].join(','));
  }
  return rows.join('\n') + '\n';
}

export function parseCsv(text: string): { samples: Sample[]; gps: GpsFix[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines[0]?.trim() !== HEADER) throw new Error(`unexpected CSV header: ${lines[0]}`);
  const samples: Sample[] = [], gps: GpsFix[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    if (c.length !== 8) throw new Error(`bad row: ${line}`);
    const [t, ax, ay, az, gx, gy, gz] = c.slice(0, 7).map(Number) as [number, number, number, number, number, number, number];
    if ([t, ax, ay, az, gx, gy, gz].some((x) => !Number.isFinite(x))) throw new Error(`bad number in row: ${line}`);
    samples.push({ t, ax, ay, az, gx, gy, gz });
    if (c[7]!.trim() !== '') gps.push({ t, speedKmh: Number(c[7]) });
  }
  return { samples, gps };
}
