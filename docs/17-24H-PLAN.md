# 17 — The 24-hour plan

> **Written 2026-10-30 at about 17:46 (Algeria), when the team said: *24 hours left, Android 14 on the Realme, nobody to interview.*** It replaces the 48-hour timeline in docs/09 §2 and extends docs/09 §7. Where this file and docs/09 differ, this file wins.
> **Assumptions to confirm** (they move the clock, not the plan): **H0 = Friday 18:00** and the deadline is **H24 = Saturday 18:00**. If the pitch slot comes earlier than the end, shift everything from the freeze onward. I do not know what is already built: run the 15-minute kickoff in §9 before anything else.

## 1. The goal for the 24 hours
**A rehearsed 90-second hero flow on real hardware, and an honest 5-minute pitch.** Nothing else earns points. Everything below either serves that or is cut.

The hero flow (docs/10 §3, drawing `diagrams/02-hero-flow-sequence.svg`), all labelled **REPLAY · SYNTHETIC** where it is a replay:
1. Realme replays `frontal_45_r16` → countdown → alert → packet over **HTTPS** → pin with band, score, reasons on the dashboard.
2. **Mobile data OFF** → the same packet by **SMS** → gateway phone → webhook → pin.
3. A witness on a second device (web page, 5 taps) → merge → confidence goes up.
4. Dispatcher acknowledges → hospital ranking → pre-alert → hospital ACK → the driver sees “received”.
5. The false-alarm moment: replay `pothole_then_stop_r16` and `phone_drop_r16`; nothing happens. Show the gate table (diagram 03).
6. The 77-character packet on the projector (`diagrams/04-sources-to-packet.svg`).

## 2. Decisions taken now (so nobody debates them at 2 a.m.)
| Cut now | Do instead | Why |
|---|---|---|
| Crew page, hospital-registry admin UI | none | not in the hero flow |
| Native Kotlin silent-SMS module | `expo-sms` **composer**, packet pre-filled, one tap to send | still a real SMS through the real gateway; try the Kotlin module only if G4 is green before H15 and A has done one before |
| Background / foreground-service Drive mode | foreground screen + keep-awake, screen on | Android 14 needs a declared service type and the screen-off behaviour is unmeasured (T6); the demo does not need it |
| OSRM, PMTiles, offline map | haversine × 1.4 ETA labelled “estimated”; online tiles; a screenshot as the map fallback | each is hours of setup |
| Arabic TTS | alarm sound + vibration + on-screen text | |
| Full three-language UI | **fr + en complete; ar only for the splash, the name and the countdown screen** (with the RTL pass on that screen) | Arabic RTL everywhere costs more than it earns in 24 h; tell the jury it is next |
| In-app witness mode | **witness web page** (one form, B) | the merge moment needs a second device, and a web page needs no APK |
| Sensor Lab | only **T1** (inventory) and **T3** (real rate) on the Realme | `rangeG` and the 45 Hz floor depend on them (docs/13 §6.3) |
| Figma-first workflow | build the UI in code from `packages/tokens`; use the blueprint page and the diagrams as the visual reference | |
| Supabase Realtime, if flaky | poll every 2 s | |

Keep, whatever happens: ingest → `assess()` → store → dashboard map and queue → incident detail with reasons → acknowledge → recommendations → pre-alert → ACK, the countdown screen, the replay screen, SOS long-press, the status screen with per-channel rows, the witness web page, the REPLAY/DEMO labels, the audit log.

## 3. Hour blocks (clock assumes H0 = Fri 18:00)
| Block | A Mobile | B Web / API | C Shared · data · gateway | D Design · pitch | Gate |
|---|---|---|---|---|---|
| **H0–H1** 18:00 | Realme set-up (§7), T1, T3 | Next app + Supabase local | gateway phone: install “SMS Gateway for Android”, check the real webhook payload at docs.sms-gate.app | slide skeleton, brand constants (docs/06 §11) | **G0 H1:** `pnpm check` green on every laptop; everyone can run the skeleton |
| **H1–H5** | detector adapter (README in `packages/detector`) + replay screen + countdown + packet + HTTPS POST | migrations, `POST /api/incidents`, `POST /api/sms/inbound`, ingest (decode → assess → merge → store) | 10–15 illustrative hospitals, ranking endpoint with haversine ETA, webhook fixtures | the three core screens from the tokens: countdown, dashboard, incident detail; slides v0 | **G1 H5:** `curl` the two canonical SMS → two incidents; a bad CRC → an *unparsed* report shown raw |
| **H5–H8** | continue | continue | **C and D sleep (3 h)**, right after G1 | | |
| **H8–H10** | Drive-mode screen (keep-awake, location speed), SOS, status screen, composer SMS path | dashboard map + queue + detail + lifecycle with reason on override; witness web page | pre-alert card and hospital ACK page | polish both UIs, packet-as-UI display, slides v1 | **G2+G3 H10:** a non-team person runs the hero flow on the dashboard in under 90 s; the Realme replay reaches the dashboard over HTTPS |
| **H10–H13** | **A and B sleep (3 h)**, right after G2/G3 | | merge display, audit view, hospital view polish | BMC, roadmap and sources slides; record the first backup videos | |
| **H13–H15** | data-OFF drill: SMS through the real gateway (T10), SIM choice | pre-alert SMS through the gateway, `/demo` reset | latency measurements ×10 per channel (quote them only as “in our test”) | hallway tests (§6) | **G4 H15:** airplane mode with SMS only still reaches the dashboard, screen-recorded |
| **H15–H18** | states: loading, empty, error, offline, SMS-only; permission and battery drill (T9) | backup deploy only if everything else is green | gate-table slide, Q&A sheet (docs/15 §4) | slides v2, demo script v2, **backup video of every step** | **FREEZE H18:** `main` tagged `demo-v1`, APK hash recorded, videos exist, nothing uncommitted |
| **H18–H22** | rehearse ×3 with a timer on the stage hardware; fix only bugs | same | same | one idea per slide; Q&A drill | **H20: dress rehearsal** |
| **H22–H24** | charge everything, cables, hotspot, second phone, laptop offline copy | freeze the DB snapshot | print the Q&A and sources | final run | **Pitch** |

Sleep rule: sleep **right after a gate that passed**, never in the middle of a task. If a gate is missed, that pair delays its sleep by one hour at most; the other pair keeps working. At least one person from each of A and B is awake at every moment.

**If a gate is missed** (the ladder, docs/10 §5): the real SMS fails → *Simulate SMS* button, labelled; the replay fails on the phone → replay inside the dashboard `/demo`; the dashboard fails → the recorded video of that step. Say out loud what is simulated.

## 4. What Android 14 changes (and what is still unverified)
- **Confirmed by you:** the Realme runs **Android 14**, which is the Realme UI 5.0 generation (sources below). Menu names differ from the Android 13 screenshots in docs/13 §6.2: write the real ones in the team wiki.
- Android 14 requires a **foreground-service type** to be declared; we avoid the service in 24 h (§2).
- Android 12 and later cap sensor rates at 200 Hz unless `HIGH_SAMPLING_RATE_SENSORS` is declared; 50–100 Hz is enough.
- Sideloaded apps can have **restricted settings** on the SMS permission (Android 13 and later): the onboarding must detect a denied permission and guide the user (docs/13 §6.2).
- **Unverified, test it:** whether the countdown takes over the screen with the phone **locked**. Android 14 changed how full-screen notifications are granted and I could not confirm the rule for sideloaded apps. For the demo, keep the screen on with keep-awake and do not depend on it.
- Realme battery management can still stop background work; set auto-launch, foreground and background activity to allowed for Sellekni.

## 5. The pitch when nobody could be interviewed
Do not invent interviews. What the jury can still see, honestly:
- **Empathize / define:** sourced problem data (DNSR 2025 via Atlas Magazine), the chain of events, the point of view (docs/15 §2.2). Say once: *“We have not yet interviewed operators or emergency departments; that is our first step after the hackathon.”*
- **Test:** **three or four hallway tests at the hackathon** with other participants and any mentor from health or emergency services, on three tasks (the countdown, reading a new dashboard report, reporting as a witness). Label them “hackathon participants, not emergency staff”. Log task, success, time, where they hesitated, what we changed (docs/15 §2.5). One visible change after a test is worth more than ten claims.
- **Iterate:** the iteration table, filled with the real changes, shown on the last slide.
- **Business viability:** the Business Model Canvas (docs/14, diagram 06) as hypotheses, plus the experiments we will run (docs/14 §4).
- **Criteria:** still unknown. Spend two minutes now asking an organiser or mentor: *the criteria and weights, the pitch length, live demo or video, whether a prepared building block is allowed* (draft message in the chat).

## 6. Hallway-test script (10 minutes each, H13–H16)
1. Hand over the Realme in replay mode: *“You hear this alarm. What do you do?”* Watch; do not help.
2. Show the dashboard with a new report: *“What do you understand? What would you do next?”*
3. Witness page on their own phone: *“You saw an accident. Report it.”* Time it.
Write one line each on hesitation and wording, change one thing, note it with the hour.

## 7. Realme set-up, 30 minutes at H0
1. Settings → About device: screenshot the Android version and the Realme UI version.
2. Install the development build. Grant location, notifications and SMS. If SMS is blocked: App info → ⋮ → *Allow restricted settings*.
3. Battery: allow auto-launch, foreground and background activity; turn off power saving for Sellekni.
4. SIM: pick the SIM that sends SMS (dual SIM) and send the composer path to the gateway number **with mobile data off**.
5. **T1:** list the accelerometer (range, resolution, minimum delay) → set `rangeG`; under ±8 g the app is SOS and witness only. **T3:** request 50, 100 and 200 Hz for 5 minutes each → median at least 50 Hz.
6. Notification channel for the alarm at high importance, and test it with the phone on silent (docs/06 §7).
7. Put the numbers and screenshots in `docs/field-notes/`. They are also your first real evidence.

## 8. Phones and SIMs
The Realme has a SIM, so it can send the SMS. You also need **a second Android phone with a SIM and credit** as the gateway, because the gateway cannot be the same phone that sends. If nobody has one, use *Simulate SMS* and say so; do not improvise a same-phone workaround in the last 24 hours.

## 9. Kickoff, 15 minutes standing, now
1. Who has what **already built**? List by gate: skeleton, ingest, dashboard, detector adapter, gateway, slides.
2. Confirm the clock: the real pitch slot, and whether the deadline is the pitch or the submission.
3. Read §2 aloud; anyone who disagrees with a cut says so now.
4. Assign the sleep shifts and one person who owns the clock and says no to scope.
5. Send the message to the organisers.

## Sources
Realme UI 5.0 is the Android 14 generation: [Fonearena, Realme UI 5.0 / Android 14 roadmap](https://www.fonearena.com/blog/407455/realme-ui-5-0-android-14-update-early-access-roadmap.html/amp) and [Gizmochina, Realme 10 Pro 5G Realme UI 5.0 early access](https://www.gizmochina.com/2023/12/20/realme-10-pro-5g-realme-ui-5-0-early-access/) (these cover the Realme 10 Pro 5G; you confirmed Android 14 on your 10 Pro+). Foreground-service types and requirements: [Android 14 changes](https://developer.android.com/about/versions/14/changes/fgs-types-required?hl=es). Sensor rate cap: [Expo sensors docs](https://docs.expo.dev/versions/v57.0.0/sdk/sensors/). The rest is in docs/13 §10 and docs/14 §1.
