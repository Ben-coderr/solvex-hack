# Final checklist — P8 §8 (print; tick on the day)

## Recorded (2026-10-31)
| Item | Value | Status |
|---|---|---|
| Release APK | `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`, built 2026-10-31 08:33 (includes `10613f7` in-app witness mode), 114 MB, sha256 `f7e433c4a747ca815abd76d47dcb549a2aaf9e48afdc73be73ee369b4702879e` | ✓ Realme: installed, witness flow tested end to end (HTTPS ACK, merge L → H). Install on the Samsung too |
| DB snapshot (public schema, after demo reset) | `data/snapshots/demo-v1-public.sql.gz`, sha256 `5797943deef108eb3afb40cdc830fa610024f37ad600e31a54be1506b0de0f7d` | ✓ restore: `gzcat … \| psql <db url>` on an empty schema |
| Git tag | `demo-v1` | after the acceptance below |
| Backup videos | `docs/pitch/videos/` 01…11 + `00-cut-60s.mp4` | ✓ browser recording · phone clips via scrcpy still to do |
| Slides | Sellekni pitch deck (artifact) → export PDF to the USB stick | ✓ deck · fill or delete the bracketed rows on “What we measured” |

Rebuild the APK: `cd apps/mobile/android && ./gradlew assembleRelease` (needs several GB free), then
`shasum -a 256 app/build/outputs/apk/release/app-release.apk` and `adb install -r …` on each phone.

## Bring (T-1 day)
- [ ] Laptop charger · phone chargers ×4 · USB-C/USB-A cables ×4 (one stays on the gateway phone) · power strip
- [ ] Hotspot phone or travel router, charged; SSID/password on a card
- [ ] Gateway phone: SIM credit topped up (one ACK SMS per alert + pre-alerts) · test SMS delivered in the room · bars ≥ 3
- [ ] Stage phones: new APK installed, permissions granted, battery optimisation off, ringer on (countdown alarm checked with silent mode)
- [ ] USB stick: videos, slides PDF, APK, DB snapshot
- [ ] Printed: `ladder.md` (taped by the laptop), `qa-sheet.md` (one per speaker), this checklist
- [ ] Cloud backup awake (Supabase Free pauses after 7 idle days): open the Vercel URL and log in — `runbook.md`

## Acceptance (P8)
- [x] `scripts/reset-demo.sh` ×5 clean — `docs/field-notes/reset-demo-x5.txt`
- [ ] Backup deploy tested end-to-end — `runbook.md`
- [x] Videos exist (01…11 + 60 s cut)
- [ ] Slides: no unsourced number — every figure is from docs/10 §4 or our own measurement with n/date/device; bracketed rows filled or removed
- [ ] Rehearsal ≤ 5:00 with the 60 s cut ready — `rehearsal-log.md`
