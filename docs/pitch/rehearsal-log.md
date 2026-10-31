# Rehearsal log — P8 §7

Target: the whole pitch ≤ **5:00** (aim to stop at 4:50) with the live system, the 60 s cut (`videos/00-cut-60s.mp4`) ready.
The format is the SolveX official one: 5 min pitch + 4 min Q&A, five parts in this order. Every speaker is visible; five team members, four speaking parts: decide who takes which.

| Time | Part · slides | Speaker |
|---|---|---|
| 0:00–0:45 | 01 The problem · cover, problem | 1 |
| 0:45–1:30 | 02 Our solution · solution | 1 then 2 (what we do NOT do) |
| 1:30–3:00 | 03 How it works + demo · how, detect (optional, 10 s), demo, closest | 2 (phone), 3 (dashboard) |
| 3:00–3:45 | 04 Value and impact · impact, algeria | 4 |
| 3:45–4:30 | 05 BMC · bmc | 4 |
| 4:30–4:50 | Conclusion · team | 1, whole team on stage |

Annex slides (measured, honesty, packet, roadmap, sources) are for the Q&A only. The teammate holding the stopwatch signals at 4:00.
Before each run: `scripts/reset-demo.sh --prod` → READY. Time with a phone stopwatch from the first word to the last.
One line per run; fill it **during** the run, not from memory.

| # | Date, time | Where / hardware | Total | Demo part (steps 1–11) | Ladder rung used | What failed | What we changed |
|---|---|---|---|---|---|---|---|
| R1 | | | | | | | |
| R2 | | | | | | | |
| R3 | | | | | | | |
| Dress (H40) | | stage laptop + projector + stage phones + hotspot | | | | | |

**Pass =** R3 and the dress rehearsal ≤ 5:00, no step stalled > 5 s without stepping down the ladder, nobody read the slides.

## Reference: the machine run (not a rehearsal)
`apps/web/scripts/record-demo.mts`, 2026-10-31, team laptop, prod build, local Supabase, Simulate SMS, no talking:
steps 1–11 take **45 s** of clicking (per step: `videos/recording.json`). Everything else in the 1:30–3:00 slot (how it works + demo + orientation) is
speech and phone handling — that is what the three rehearsals measure.
