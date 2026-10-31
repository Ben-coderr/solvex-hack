# P7 offline drill — 2026-10-31

**Result: passed (19/19 checks)** on the laptop's prod build (`./sellekni up --prod`), Chrome 156, synthetic data.
Raw result: `offline-drill-p7.json` · map evidence: `offline-drill-map.jpg` · reproduce: `apps/web/scripts/offline-drill.mts`.

How "unplugged" was produced: the browser could reach only the laptop (every other host aborted with
`internetdisconnected`, `navigator.onLine = false`); then, for phase B, the browser lost the laptop too (context offline).
This is the browser side of pulling the cable. It does not replace the phone-side drill (airplane mode + SMS only, G4),
which the team runs on the real phones.

| Phase | Check | Result |
|---|---|---|
| A — no internet | /login, dashboard, drawer + orientation, /audit, /demo, /phones, /styleguide, witness /w, crew /crew, hospital ED view render | ✓ all |
| A | dashboard says "SMS only — alerts still go out", strip online = warn | ✓ |
| A | Simulate SMS → incident created; pre-alert sent; hospital sees it | ✓ |
| A | map draws from `/tiles/sellekni.pmtiles` (18–19 HTTP 206 range reads), strip says "Offline map" | ✓ (roads, built-up areas, pins, H markers; no place names: see below) |
| A | external hosts the app tried to reach | **none** |
| B — server unreachable | dashboard says "Offline — saved, will retry" | ✓ (after the fix below; ≤ 10 s) |
| B | queue keeps the last data; recovers by itself when the server is back | ✓ |
| — | no 5xx or page errors from our origin | ✓ |

## What the drill found and changed
1. **No offline basemap was installed** (`public/tiles/sellekni.pmtiles` was planned, never extracted): without internet
   the map would have been a blank surface. Extracted northern Algeria (bbox -2.3,34.6 → 8.7,37.2, z0–13, 69 MB) from the
   Protomaps build 20261030 with `pmtiles extract … --maxzoom=13`; git-ignored. Next serves `public/` as of build time:
   rebuild after adding the file. Rebuild command:
   `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles apps/web/public/tiles/sellekni.pmtiles --bbox=-2.3,34.6,8.7,37.2 --maxzoom=13`
2. **"Offline" was never shown when the browser itself went offline.** TanStack Query pauses queries while the browser
   reports offline, so the `/api/health` probe never failed and the dashboard kept saying "SMS only — alerts still go
   out" while it could not reach its server. The probe now runs with `networkMode: 'always'`.

## Still open
- Offline map has no place names: labels need glyph PBFs served locally (`NEXT_PUBLIC_MAP_GLYPHS`). Roads and pins are enough
  to point a crew; town names would help the dispatcher read the map faster.
- Routing offline: ETAs fall back to the haversine estimate (flagged "estimated") unless OSRM runs on the laptop.
