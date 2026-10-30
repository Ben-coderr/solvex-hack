/**
 * Replay engine: feeds a recorded trace through the SAME detector the live sensors use, at the recorded timing
 * (rate 1) or faster for development (rate 4). Pure TypeScript with an injected clock, so it is unit-tested
 * without timers. While a replay runs the UI shows REPLAY on every screen (the app store's `replay` field).
 */
import type { Detector, DetectorEvent, DetectorSnapshot, Sample } from '../detector/detector';

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
  samples: readonly Sample[];
  detector: Detector;
  rate?: ReplayRate;
  clock?: Clock;
  /** UI refresh period (ms of wall-clock time) */
  tickMs?: number;
  /** last sample of each tick + the detector snapshot after it (throttled for the UI) */
  onTick?: (s: Sample, snap: DetectorSnapshot, progress: number) => void;
  onEvent?: (e: DetectorEvent, s: Sample) => void;
  onEnd?: () => void;
}

export interface ReplayHandle {
  stop(): void;
  isRunning(): boolean;
  /** 0..1 of the trace duration */
  progress(): number;
}

export function startReplay(o: ReplayOptions): ReplayHandle {
  const clock = o.clock ?? systemClock;
  const rate = o.rate ?? 1;
  const tick = o.tickMs ?? 50;
  const first = o.samples[0]?.t ?? 0;
  const span = Math.max(1, (o.samples.at(-1)?.t ?? 0) - first);
  const started = clock.now();
  let i = 0;
  let running = o.samples.length > 0;
  let handle: unknown = null;

  const step = () => {
    if (!running) return;
    const traceNow = first + (clock.now() - started) * rate;
    let last: Sample | null = null;
    while (i < o.samples.length && o.samples[i]!.t <= traceNow) {
      const s = o.samples[i++]!;
      for (const e of o.detector.push(s)) o.onEvent?.(e, s);
      last = s;
      if (!running) return; // an event handler stopped the replay (e.g. the countdown took over)
    }
    if (last) o.onTick?.(last, o.detector.snapshot(), (last.t - first) / span);
    if (i >= o.samples.length) {
      running = false;
      o.onEnd?.();
      return;
    }
    handle = clock.setTimeout(step, tick);
  };
  handle = clock.setTimeout(step, 0);
  if (!running) o.onEnd?.();

  return {
    stop() {
      running = false;
      if (handle !== null) clock.clearTimeout(handle);
    },
    isRunning: () => running,
    progress: () => (o.samples.length ? ((o.samples[Math.max(0, i - 1)]!.t - first) / span) : 1),
  };
}
