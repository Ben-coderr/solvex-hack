# P7 performance pass — dispatcher dashboard with 50+ incidents

Date 2026-10-31 · MacBook (Intel, the team laptop) · Chrome 156 via Playwright, 1440×900 · prod build (`next start`) against
local Supabase · 50 incidents seeded through the real ingest path (`/api/sms/paste`), then 5 more arriving live.
Raw runs: `perf-dashboard.jsonl` (one JSON line per run). Reproduce: `scripts/perf-dashboard.mts`, `scripts/perf-burst.mts`.
Lighthouse itself was not run (no download on this machine); the same signals were read from Chrome's performance APIs
(LCP, layout-shift, longtask observers, rAF frame gaps, CDP CPU throttling).

| Measure | Baseline | After the two fixes (2 runs) |
|---|---|---|
| Rows + pins ready (50) | 605 ms | 586 / 550 ms |
| LCP | 924 ms | 964 / 744 ms |
| **CLS on load** | **0.114** (DEMO banner + demo links appear ~170 ms after first paint) | **0.0014 / 0.0014** |
| CLS while 5 pins arrive | 0 | 0 / 0 |
| Long tasks on load (count, total) | 2, 142 ms | 6, 455 ms / 5, 296 ms — run-to-run noise, not improved |
| Map pan, 1× CPU | 60 fps, p95 frame 16.7 ms | 60 fps, p95 16.7 ms |
| Map pan, 4× CPU throttle | 38 fps, p95 50 ms, 63 long tasks | 43 / 44 fps, p95 50 / 33 ms, 19–20 long tasks (within noise; not claimed as a fix) |
| **20 arrivals in a burst, dashboard open** | **52 full-list refetches, 25 answered 429** (the dispatcher's own 120/min limit) | **2 refetches, 0 × 429** |
| JS transferred | 598 KB, 16 files | 599 KB, 17 files |

## The two items fixed
1. **Realtime refetch storm.** One ingest writes 3+ rows (incident, report, assessment); every push invalidated the full
   incident list. A 20-alert burst (a pile-up) made 52 list refetches and the dashboard started getting 429 from its own
   rate limit, i.e. the queue could stop updating exactly when it matters. Pushes are now coalesced for 250 ms and each
   query is invalidated once (`providers.tsx`). The D1 "< 2 s from SMS to row" e2e still passes.
2. **Layout shift on load.** The DEMO banner and the demo nav links depended on a client fetch of `/api/health`, so the
   whole dashboard jumped ~one banner height after first paint. The server now renders its health answer into the page
   (`DispatchProviders health=…`).

## Not fixed (next)
- Map at 4× CPU throttle stays ~40 fps: 273 hospital markers + incident pins are DOM markers re-positioned on every frame.
  Moving hospitals to a MapLibre symbol layer (one canvas draw) is the next step; it changes the marker a11y/e2e hooks, so
  it was not done the day before the demo. At 1× (the stage laptop) panning holds 60 fps.
- Load long tasks (150–450 ms total) vary run to run; not investigated further.
