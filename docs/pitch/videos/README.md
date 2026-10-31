# Backup videos — docs/10 §3 steps 01…11

`01…11-<step>.mp4` match the demo script; `00-cut-60s.mp4` is the whole run (≈ 45 s at 1×, so it fits the 60 s slot
without speed-up). Timings per step: `recording.json`. Copy the folder to the desktop **and** a USB stick (ladder.md, rung 4).

**What these are:** a recording of the real app (prod build, local Supabase, synthetic data) in Chrome, French UI, four
views recorded at once and cut per step (`apps/web/scripts/record-demo.mts`, re-run after any UI change):
dispatcher (05, 08, 09, 11), dispatcher + hospital ED view (10), witness phone page + dispatcher (07), and the browser
stand-in for the phones, `/phones` (01–04, 06). The alert enters through **Simulate SMS** (same ingest code, labelled DEMO).

**Not yet recorded — needs the stage phones (scrcpy):**
- 01–03 on Phone A: replay `rollover_71`, data OFF, the g-graph, the countdown and the dialler on 14
  (`scrcpy --record 01-phone-a.mp4`, then cut).
- 04 the real SMS arriving on the gateway phone; 06 the ACK SMS on Phone A; 10 Phone D buzzing with the pre-alert SMS.
Until then, 01–04 and 06 show the browser stand-in, and the caption on every frame says DEMO · synthetic data.

The dashboard strip in these clips shows "SMS gateway unreachable" (no gateway phone was plugged in) and
"Routes unavailable: estimates" (no OSRM running): both are true for this recording.
