# 15 — Jury alignment and the evidence pack (Design Thinking, BMC, pitch)

> **What this is.** The team told me the organisers care about *many things — the BMC, the jury criteria, Design Thinking.* This file turns that into (1) a map from each criterion to the evidence we already have and the gap, (2) a Design Thinking evidence plan that is **real, not decorated**, (3) a revised 5-minute pitch that does not depend on unsourced numbers, (4) a corrected Q&A bank, and (5) a self-score that tells us where the next hours pay off most.
>
> **The criteria are NOT confirmed.** I found two *assumed* lists in the old files: `01-problem-analysis.md` ("innovation, feasibility, impact, demo quality, pitch — typical, to be confirmed") and PLAN_V3 §15.3 (innovation, social impact, technical feasibility, commercial viability/BMC, Design Thinking, scalability, originality). The second matches what the team describes, so I use the **union** below. **Please send the official brief or criteria and weights**; everything here re-weights in ten minutes. (Organiser questions: `00-START-HERE.md` §7, Q2.)

## 1. Criteria → claim → evidence → gap

| Criterion | The claim we can make | Evidence already in the pack | Gap — what to do | Do **not** claim |
|---|---|---|---|---|
| **Innovation** | A complementary data layer that works when data is weak (SMS), explains its severity estimate, and shows the operator a merged picture + hospital recommendation | docs/05 protocol & scoring; golden vectors + independent Python implementation; explainability (band + score + confidence + top-3 reasons) | add the **range-aware phone detector** story (docs/13): "we know phone sensors saturate, so we measure time at the ceiling and GPS speed collapse" — a technical insight most teams will not have | "first", "AI", "better than Apple/Google" |
| **Social impact** | Road deaths are a national problem: **3 838 deaths, 26 976 accidents, 37 020 injured in 2025** (DNSR via Atlas Magazine); the human factor is cited in > 96 % of accidents | docs/14 §1 (sourced) | impact *metrics we will measure* in a pilot (docs/14 §2 last row) — as a plan, not a result | "X lives saved", "18 minutes", any projected number |
| **Technical feasibility** | The core works and is tested: 67 + 10 + 21 tests, an independent decoder that agrees on 302 packets, a detector that rejects the traps that fool naive detectors | `pnpm check` output; `pnpm --filter @sellekni/detector report` table (docs/13 §4) | run the **Realme field protocol** (docs/13 §6) and show 2–3 real traces; real SMS on stage with a fallback ladder | a detection rate; "tested on real crashes" |
| **Business viability (BMC)** | A public-safety layer, free to senders and (in the pilot) to receivers; payer candidates identified; verified startup-label route | docs/14 | **3–5 interviews** with potential payers/operators (docs/14 §4); replace "we don't know" with their words | prices, revenue projections |
| **Design Thinking** | We defined the problem from the chain of events, framed a POV, asked HMW questions, prototyped at four fidelities, tested with users and changed the product | docs/01–03 of the old pack (problem analysis), this file §2 | **do the interviews and tests** (§2) — no invented personas | fictional user quotes, "we interviewed 50 users" |
| **Scalability** | Server-authoritative stateless scoring, multi-wilaya data model, a protocol with a version byte and a documented v1.1 path for new sources (box, OBD) | docs/04, docs/12 §6, docs/16 | a one-slide roadmap: pilot → corridor → regional (no dates we cannot defend) | national numbers of devices or users |
| **Originality** | We combine phone crash detection, an SMS fallback and an operations-room view with a hospital recommendation | docs/14 §3 (competition honestly mapped) | finish the competitor table with what you *verify* by installing/using each app | "no equivalent app exists in Algeria" |
| **Demo quality** | 90-second hero flow with a resilience ladder (real SMS → Simulate SMS → replay → video) | docs/10 §3 | rehearse ×3, time it; label REPLAY/DEMO on screen | live claims you cannot reproduce |
| **Pitch** | Clear problem → solution → demo → model → ask | §3 below | one slide per criterion; one sentence each | read-aloud slides |

## 2. Design Thinking evidence pack (what to produce, in this order)

> **With 24 hours left and nobody reachable (2026-10-30), `docs/17` §5–§6 replaces the interviews by three or four hallway tests at the hackathon, labelled “hackathon participants, not emergency staff”, and says plainly that operators and emergency departments are the first step after the event.**
>
> **Rule: nothing here may be invented.** If you cannot reach a real person, write "not yet validated" on the slide. Five honest short interviews beat fifty imaginary ones.

### 2.1 Empathize — five short conversations (15 min each)
| Who | Why | Questions (open, past behaviour, no leading) |
|---|---|---|
| A driver (or a taxi/bus driver) | the sender | "Tell me about the last time you saw or were in an accident. What did you do first? What did you not know? What made calling hard?" |
| A Protection civile / SAMU operator or volunteer | the receiver | "Walk me through the last road-accident call. What do you ask first? What is missing? How do you know where the caller is?" |
| An ED nurse or doctor | the hospital | "What do you wish you knew 10 minutes before the patient arrives? What does a useful pre-alert look like?" |
| A fleet manager or insurer | possible payer | "How do you learn about a crash today and how long does it take? What does the delay cost you?" |
| A traffic police officer (optional) | scene reality | "What does a scene look like when you arrive? Who has already called?" |
**Capture:** date, role (no names), 3 quotes, 3 pain points, what surprised you. Keep one page per conversation in `docs/field-notes/interviews/`. *Ask permission; do not record without consent; no names or numbers in the repo.*

### 2.2 Define — the POV (sourced version)
> *"Drivers, passengers and witnesses in a serious road crash in Algeria need a way to get their **exact location** and a **first picture of severity** to the emergency services — **even when they cannot make the call or the data connection is weak** — because in 2025 the country recorded **26 976 road accidents and 3 838 deaths** (DNSR) and the current chain depends on a person who is in shock to find a phone, call, and describe where they are."*
Insights to confirm in interviews (write what you actually heard): *the caller cannot say where; the operator lacks severity information; hospitals are warned late.* (The old plan's "18 minutes" is **not** in the POV: no source.)

### 2.3 Ideate — How-might-we questions (pick the top 3 to build)
1. HMW get the right location to the operations room when the caller cannot describe it?
2. HMW give the operator severity cues without replacing their judgement?
3. HMW stop a phone detector from crying wolf? *(→ docs/13: gates, countdown, ablation tests)*
4. HMW alert services when mobile data is weak? *(→ DZ-MSD over SMS)*
5. HMW help the dispatcher choose a hospital that can treat *this* patient, not just the nearest? *(→ ranking by capability × ETA × status)*
6. HMW let a bystander report in seconds, safely, without an account? *(→ witness mode, 5 taps)*
Evidence: a photo of a Crazy-8s sheet or sticky notes (Whiteboard artifact) and the 3 chosen HMWs with the reason.

### 2.4 Prototype — four fidelities (keep screenshots of each)
P0 paper or Figma clickable of the countdown + dashboard · P1 dashboard with *Simulate SMS* · P2 phone in replay mode · P3 real SMS end to end. Each gets a date and a one-line "what we learned".

### 2.5 Test — five people, three tasks, a log
Tasks: *(1) "You hear the alarm — what do you do?" (countdown screen) · (2) "A new report appeared — what do you understand?" (dashboard, with an operator or a nurse) · (3) "Report an accident you see" (witness mode).* Log: task, success (y/n), time, where they hesitated, what they said, what we changed. **Slide: "We changed N things after testing: …"** — that sentence is what the criterion rewards. Typical honest findings: wording, button size, what the operator looks at first.

### 2.6 Iteration log (one table, shown at the end of the pitch)
| Date | What we learned | What we changed |
|---|---|---|
| … | … | … |

## 3. Pitch structure — 5 minutes, mapped to criteria (replaces PLAN_V3 §15.1)
| Time | Content | Criterion served | Notes |
|---|---|---|---|
| 0:00–0:30 | **Hook:** "In 2025, 3 838 people died on Algeria's roads (DNSR). When it happens, someone in shock has to find a phone, call, and say where they are." | impact | sourced; no "18 minutes" |
| 0:30–1:00 | POV + the chain of events (5 steps) + what we heard in interviews (1 quote) | Design Thinking | real quote or none |
| 1:00–1:30 | Solution in one picture (`diagrams/01-system-architecture.svg`): phone → packet → operations room → hospital; complementary to 14/1021; humans decide | innovation, feasibility | |
| 1:30–3:00 | **Live demo** (docs/10 §3), with the resilience ladder | demo, feasibility | say REPLAY/DEMO out loud |
| 3:00–3:30 | "Closest ≠ best" + the phone-sensor insight in one sentence ("phones saturate, so we use how long, not how hard") | innovation, originality | |
| 3:30–4:00 | **BMC** slide (docs/14): who pays — hypotheses, what we verified, what we test next | business viability | no prices |
| 4:00–4:30 | Roadmap slide: pilot → corridor → regional; box/OBD as *roadmap* | scalability | docs/16 |
| 4:30–5:00 | Iteration log + the ask (a pilot partner, an operator to co-design with, clinician review) | Design Thinking | |

## 4. Q&A bank — corrected (replaces PLAN_V3 §15.5; docs/10 §6 remains the base)
| Question | Honest answer (short) | Changed from the old plan because |
|---|---|---|
| Why SMS and not just 4G? | SMS needs only the voice/SMS network, so it can work where data is weak; we send over HTTPS first and fall back to SMS. *We have not measured Algerian coverage — we will ask the operators for coverage maps.* | the old answer quoted "72 % 4G, ~95 % SMS": no source |
| Is the severity estimate medically validated? | No. It is decision support built from published triage criteria; weights are uncalibrated assumptions; a human always decides; we need emergency physicians to review it | the old answer implied validation |
| False alarms (speed bumps)? | Four gates (armed only above 25 km/h, a sustained impact, a GPS speed collapse, the vehicle stops) plus a 30-second "I'm OK" countdown; we tested the logic on 10 synthetic scenarios (2 crashes, 8 non-crashes, including a bump, a pothole, a dropped phone); we are collecting real traces. *No false-positive rate yet.* | old "< 2 % on simulated data" is not a measurement |
| Why not use the ambulances' GPS? | We complement dispatch; we do not depend on ambulance equipment. | old answer cited "< 30 % have GPS" with no source |
| Apple/Google already detect crashes. | Yes, on some recent phones; availability and local-emergency integration in Algeria are not something we have verified. We are a data layer for **Algerian operators** (SMS, hospital orientation, audit), and we run on mid-range Android phones. | not covered before |
| Isn't this just 14/1021 with extra steps? | No: it never replaces the call (the app opens the dialler), and it adds location, severity cues and de-duplication for the operator. | |
| Privacy and liability? | Location is shared only after consent and only during an alert; medical profile never goes by SMS; nothing is dispatched automatically; every action is audited. We would need a legal review (law 18-07) before any real deployment. | |
| Who would pay? | Not decided. Candidates and the tests we will run are on the BMC slide (docs/14). | old answer gave prices |
| What did you build in 48 hours vs prepare? | We prepared the protocol/scoring/detector packages and the design system **before** the event (disclosed in the README and on the slide); everything user-facing — apps, dashboard, integration — was built during the event. *Confirm with the organisers that this is allowed (00-START-HERE §7 Q1).* | |
| Why a phone and not a box in the car? | A box can see the real crash pulse (±200 g), a phone cannot — it's on our roadmap (docs/16). The phone needs nothing to install in the vehicle, which is what makes a pilot possible. | |
| How does it scale? | Stateless scoring, a versioned protocol, a per-wilaya hospital registry; pilot → corridor → regional. We have no capacity numbers yet. | |

## 5. Self-score (my estimate, not the jury's) and what to do first
Scale 1–5, today, assuming P0–P8 are built as planned. **Where the next hours buy the most is where the score is lowest.**
| Criterion | Now | After the actions above | Highest-value action |
|---|---|---|---|
| Innovation | 4 | 4 | tell the saturation/time-at-ceiling story with the figure (`diagrams/07-saturation.svg`) |
| Social impact | 3 | 4 | one operator interview + the sourced hook |
| Technical feasibility | 4 | 5 | 2–3 **real** phone traces + one real-SMS run |
| Business viability | 2 | 3 | 3 interviews; don't invent prices |
| Design Thinking | 2 | 4 | the five conversations + the 5-person test log + the iteration table |
| Scalability | 3 | 3 | the roadmap slide |
| Originality | 3 | 4 | installed-and-tried competitor table |
| Demo quality | 4 | 5 | rehearse ×3 with a timer |
| Pitch | 3 | 4 | one idea per slide |

## 6. Evidence on the table (print or keep open in tabs)
Repository link and the `pnpm check` output · the detector report table · 2–3 real trace plots · interview one-pagers · test log · BMC · roadmap · sources slide (all links from docs/13 §10, docs/14 §1) · a recorded video of the full flow (the last rung of the ladder) · the **disclosure** line about prepared components.

## 7. Sources
See docs/14 §1 and docs/13 §10. The criteria lists come from the team's earlier files (`01-problem-analysis.md` §assumption; PLAN_V3 §15.3) and are unconfirmed.
