import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDetector, runTrace, type DetectorEvent } from '../src/detector/detector';
import { makeTrace, TRACE_NAMES } from '../src/detector/synth';
import { parseCsv, toCsv } from '../src/detector/trace';
import { BUNDLED_TRACES } from '../src/replay/bundled-traces';
import { startReplay, type Clock } from '../src/replay/engine';

/** Manual clock: timers fire in order as `advance()` moves time. */
function fakeClock() {
  let now = 1_000_000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (h) => { timers = timers.filter((t) => t.id !== h); },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = end;
  };
  return { clock, advance };
}

test('replay at recorded timing gives exactly the decisions of a direct run (same detector)', () => {
  const samples = parseCsv(BUNDLED_TRACES.rollover_71);
  const { clock, advance } = fakeClock();
  const got: DetectorEvent[] = [];
  let ended = false;
  startReplay({ samples, detector: createDetector(), clock, onEvent: (e) => got.push(e), onEnd: () => { ended = true; } });
  advance(17_000);
  assert.deepEqual(got.map((e) => e.type), ['armed', 'candidate'], 'nothing early: CONFIRM waits for t = 18 s');
  advance(14_000);
  assert.ok(ended);
  assert.deepEqual(got, runTrace(samples));
});

test('4× rate finishes a 30 s trace in ~7.5 s of wall time', () => {
  const samples = parseCsv(BUNDLED_TRACES.rollover_71);
  const { clock, advance } = fakeClock();
  let ended = false;
  startReplay({ samples, detector: createDetector(), clock, rate: 4, onEnd: () => { ended = true; } });
  advance(7_400);
  assert.equal(ended, false);
  advance(200);
  assert.equal(ended, true);
});

test('stop() from inside the CONFIRM handler halts the feed immediately', () => {
  const samples = makeTrace('frontal_45');
  const { clock, advance } = fakeClock();
  let fed = 0;
  const h = startReplay({
    samples, detector: createDetector(), clock, rate: 4,
    onEvent: (e) => { if (e.type === 'confirm') h.stop(); },
    onTick: () => { fed++; },
  });
  advance(60_000);
  assert.equal(h.isRunning(), false);
  assert.ok(h.progress() < 0.7, `stopped at ${h.progress()}`);
  assert.ok(fed > 0);
});

test('bundled traces in the app are the data/traces library', () => {
  for (const name of TRACE_NAMES) assert.equal(BUNDLED_TRACES[name], toCsv(makeTrace(name)), name);
});

test('an empty trace ends at once', () => {
  let ended = false;
  const h = startReplay({ samples: [], detector: createDetector(), clock: fakeClock().clock, onEnd: () => { ended = true; } });
  assert.equal(ended, true);
  assert.equal(h.isRunning(), false);
});
