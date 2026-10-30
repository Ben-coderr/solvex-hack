/**
 * Replay engine (M3): feeds a trace (`parseCsv` from @najda/detector) through the SAME detector host the live
 * sensors use, at the recorded timing (rate 1) or faster for development (rate 4). Samples and GPS fixes are merged
 * by time exactly as the package's `replay()` does (a fix is pushed before a sample with the same or later t), so a
 * paced replay yields the package's decisions. Pure TypeScript with an injected clock: unit-tested without timers.
 * While a replay runs the UI shows REPLAY · SYNTHETIC on every screen (the session's `replay` field).
 */
import type { Decision, GpsFix, Sample } from '@najda/detector';
import type { DetectorHost } from '../detector/adapter';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type ReplayRate = 1 | 4;

export interface ReplayOptions {
  trace: { samples: readonly Sample[]; gps: readonly GpsFix[] };
  host: DetectorHost;
  rate?: ReplayRate;
  clock?: Clock;
  /** UI refresh period (ms of wall-clock time) */
  tickMs?: number;
  onTick?: (progress: number) => void;
  onDecision?: (d: Decision) => void;
  onEnd?: () => void;
}

export interface ReplayHandle {
  stop(): void;
  isRunning(): boolean;
  /** 0..1 of the trace duration */
  progress(): number;
}

type Step = { t: number; sample: Sample } | { t: number; gps: GpsFix };

/** One time-ordered stream; on equal t the GPS fix goes first (same order as the package's replay()). */
export function mergeTrace(trace: ReplayOptions['trace']): Step[] {
  const out: Step[] = [];
  let g = 0;
  for (const s of trace.samples) {
    while (g < trace.gps.length && trace.gps[g]!.t <= s.t) { const f = trace.gps[g++]!; out.push({ t: f.t, gps: f }); }
    out.push({ t: s.t, sample: s });
  }
  while (g < trace.gps.length) { const f = trace.gps[g++]!; out.push({ t: f.t, gps: f }); }
  return out;
}

export function startReplay(o: ReplayOptions): ReplayHandle {
  const clock = o.clock ?? systemClock;
  const rate = o.rate ?? 1;
  const tick = o.tickMs ?? 50;
  const steps = mergeTrace(o.trace);
  const first = steps[0]?.t ?? 0;
  const span = Math.max(1, (steps.at(-1)?.t ?? 0) - first);
  const started = clock.now();
  let i = 0;
  let running = steps.length > 0;
  let handle: unknown = null;
  const progress = () => (steps.length ? (steps[Math.max(0, i - 1)]!.t - first) / span : 1);

  const step = () => {
    if (!running) return;
    const traceNow = first + (clock.now() - started) * rate;
    while (i < steps.length && steps[i]!.t <= traceNow) {
      const st = steps[i++]!;
      const decisions = 'sample' in st ? o.host.pushSample(st.sample) : o.host.pushGps(st.gps);
      for (const d of decisions) {
        o.onDecision?.(d);
        if (!running) return; // the handler stopped the replay (the countdown took over)
      }
    }
    o.onTick?.(progress());
    if (i >= steps.length) {
      running = false;
      o.onEnd?.();
      return;
    }
    handle = clock.setTimeout(step, tick);
  };
  if (running) handle = clock.setTimeout(step, 0);
  else o.onEnd?.();

  return {
    stop() {
      running = false;
      if (handle !== null) clock.clearTimeout(handle);
    },
    isRunning: () => running,
    progress,
  };
}
