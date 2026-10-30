/**
 * Replay trace format (data/traces/*.csv). One header line, then one row per sensor sample:
 *   t,ax,ay,az,gx,gy,gz,speed
 * t = ms since the start of the trace · a = g (gravity included) · gyro = rad/s · speed = latest GPS speed in
 * km/h, empty when there is no fix. Same format as the sensor lab export (M9), so recorded trips replay as-is.
 */
import type { Sample } from './detector';

export const TRACE_HEADER = 't,ax,ay,az,gx,gy,gz,speed';

const r3 = (x: number) => {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? '0' : String(v);
};

export function toCsv(samples: readonly Sample[]): string {
  const rows = samples.map((s) =>
    [String(Math.round(s.t)), r3(s.ax), r3(s.ay), r3(s.az), r3(s.gx), r3(s.gy), r3(s.gz), s.speed === null ? '' : r3(s.speed)].join(','),
  );
  return `${TRACE_HEADER}\n${rows.join('\n')}\n`;
}

export class TraceError extends Error {
  constructor(public line: number, message: string) {
    super(`trace line ${line}: ${message}`);
  }
}

/** Strict parser: a malformed trace fails loudly with its line number instead of replaying something else. */
export function parseCsv(text: string): Sample[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines[0]?.trim() !== TRACE_HEADER) throw new TraceError(1, `expected header "${TRACE_HEADER}"`);
  const out: Sample[] = [];
  let prev = -Infinity;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',');
    if (cells.length !== 8) throw new TraceError(i + 1, `expected 8 columns, got ${cells.length}`);
    const n = cells.map((c, k) => (k === 7 && c.trim() === '' ? null : Number(c)));
    if (n.some((v) => v !== null && !Number.isFinite(v))) throw new TraceError(i + 1, 'not a number');
    const [t, ax, ay, az, gx, gy, gz, speed] = n as [number, number, number, number, number, number, number, number | null];
    if (t < prev) throw new TraceError(i + 1, 'time goes backwards');
    prev = t;
    out.push({ t, ax, ay, az, gx, gy, gz, speed });
  }
  return out;
}
