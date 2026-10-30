# 10 — Pitch, Demo, Q&A

> The jury remembers four things: **a name, one number you measured, one moment, and whether you were honest.** Build the pitch around those.
> Judging criteria are an ASSUMPTION (innovation, feasibility, impact, demo, pitch, sustainability): get the real weights from the organisers.

## 1. The five moments that make it memorable
1. **The packet on the projector.** 93 characters, readable by anyone: `NAJDA1 K7Q2M R75H 36.47213,2.82871 T1432 SA …`. "This is everything that travels. No app needed to read it."
2. **Data OFF on stage, and it still works** (SMS path).
3. **The false-alarm drop test:** throw the phone on a cushion; nothing happens.
4. **The merge:** a second phone reports the same crash; the confidence pill flips **M → H**.
5. **The hospital phone buzzes**, the dispatcher sees ✓. Loop closed. Close on the Golden Ring.

## 2. Five-minute structure

| Time | Slide / action | Say (shape, not script) |
|---|---|---|
| 0:00–0:30 | Black screen, crash sound, silence. "14:32, RN road, nobody sees it." | A driver alone at night. His phone knows. Today it does nothing. |
| 0:30–1:10 | **The first minutes are lost to information** | About 10 people die on Algerian roads every day (DNSR 2025: 3,838 deaths). WHO estimates the true toll is higher (8,106 estimated vs 3,322 reported, 2021). The location is described by voice; severity is unknown until arrival; the hospital learns when the ambulance arrives. |
| 1:10–1:40 | **NAJDA: a data layer, not a replacement** | Phone → 160-character message → operations room → hospital. We never replace 14/1021; the app opens the dialler. **Humans decide everything.** |
| 1:40–3:20 | **LIVE DEMO** (§3) | Data off. Impact. Packet. Pin. Reasons. Merge. Hospital. |
| 3:20–3:55 | **What we measured** (slide of *our* numbers) | Alert-to-dashboard: X s (internet), Y s (SMS), n = 10 each. 0 false alerts in N staged events. Witness report in Z s median (5 first-time users). 100% round-trip on 5,000 random packets; independent Python implementation agrees. |
| 3:55–4:25 | **Validated vs assumed** (the honesty slide) | Inputs come from the 2021 ACS/NHTSA field-triage guideline and crash-physics research. Weights are uncalibrated. Hospital capability data is a curated table. Calibration with SAMU doctors is the pilot's first task. |
| 4:25–4:50 | **Built for Algeria, ready to pilot** | Plain SMS on any operator; hospitals need no IT; ar/fr; Law 18-07 / 25-11 by design; one wilaya pilot on a high-traffic national road. |
| 4:50–5:00 | Golden Ring, last frame | "Every minute is information. Let's give them back." |

**Do not say:** "AI triage", "saves lives" as a fact, "18 minutes average delay", any percentage you cannot source, "SAMU 115". Say "rules", "estimated risk", "we will measure it in the pilot".

## 3. Demo script — the 90-second hero flow

**Setup (all reset with `/demo → Reset`):** Phone A (driver, replay mode, mirrored with `scrcpy`) · Gateway phone visible on the table (its screen shows received SMS) · Laptop 1 = dispatcher dashboard on the projector · Laptop 2/tablet = hospital view · Phone C = witness · Phone D = hospital SMS receiver · hotspot on.

| # | Presenter | Audience sees | If it fails |
|---|---|---|---|
| 1 | "This phone is in a car on the RN at 71 km/h." Start **replay `rollover_71`** (REPLAY banner). Turn **mobile data OFF** and say so. | live speed + g-graph; data icon gone; `SMS only` banner | continue; the banner is the point |
| 2 | (trace hits impact) | graph spikes to 38 g, speed → 0; alarm + voice *Êtes-vous blessé ? / هل أنت بخير؟*; countdown (10 s in demo mode: say so) | skip to 4 with Simulate SMS |
| 3 | Don't touch the phone | "No response, sending help." Dialler opens on **14** (cancel on stage: "the real call still happens") | |
| 4 | Point at the gateway phone | the SMS arrives: zoom on the text, **"160 characters, readable without our software"** | step 5 with **Simulate SMS** |
| 5 | Switch to the dashboard | pin ▲ **R 75 · High**, reasons: speed drop ~71 km/h · SpO₂ 89% · rollover; age timer; `SMS` channel; AUTO·UNCONFIRMED badge | refresh once; else video |
| 6 | Phone A | ✓ SMS delivered (and "Received by rescuers" if M12 is built) | |
| 7 | Teammate on Phone C: **5 taps** (2 vehicles, motorbike, trapped, child) | merged into the same pin, "×2 reports", **confidence M → H**, hint *extrication* | Simulate witness from `/phones` |
| 8 | Click ACKNOWLEDGED → DISPATCHED | lifecycle bar advances (audit entry each time) | |
| 9 | Open **Orientation** | top-3 hospitals, route drawn; CHU-A 24 min all capabilities; the nearer EPH greyed "no neurosurgery / ICU" — *"closest ≠ best"*; the *nearest ED* tag is still shown | |
| 10 | **Pre-alert** | Laptop 2 shows the patient card + ETA countdown; **Phone D buzzes**; hospital ACK → ✓ on dispatcher | |
| 11 | Close | "From impact to a ready hospital, without internet. Humans decided every step." Open the audit log for 3 seconds | |

Rehearse 3 times with the live system; time each rehearsal; keep a 60-second version for when the stage clock shrinks.

## 4. Safe claims (the only statistics you may state) and their sources
Source IDs refer to the research files you supplied (`08-sources.md`). Re-verify anything you put on a slide.

| Claim | Source | Caveat to say or know |
|---|---|---|
| DNSR 2025: 26,976 injury crashes, 3,838 deaths, 37,020 injured (≈ 10 deaths/day) | A4 | press report of the DNSR figures |
| WHO estimate 8,106 deaths (2021) vs 3,322 reported | A1 | estimate with a confidence interval (7,119–9,094) |
| Protection civile 2023: 63,694 road interventions, 1,893 deaths, 79,771 injured | A3 | different counting basis from Gendarmerie/DNSR |
| Emergency numbers: Protection civile 14 / 1021, Gendarmerie 1055, Police 17 / 1548 | A8–A11 | **no national SAMU number confirmed** |
| 1055 callers are asked to give the exact address verbally | A8 | |
| Pixel crash detection and Android ELS not available in Algeria | B2, B3 | status at research time: check again before the event |
| Automatic notification 1.2 min vs 5.7 min for witness calls | C4 (NHTSA field test) | US, 1990s: **an analogy, not an Algerian measurement** |
| +10 min prehospital time ≈ +4% adjusted odds of in-hospital death (OR 1.04) | D3 (Gauss, JAMA Surg 2019) | French physician-staffed EMS |
| Android ≈ 87% of mobile OS share in Algeria | B14 | StatCounter snapshot |
| 69 wilayas | A18 | |
| eCall MSD ≤ 140 bytes | B5 | our DZ-MSD is inspired by it, not a standard |

**Unsourced numbers in the earlier plan — do not use:** ">18 min average alert-to-hospital delay", "<30% of ambulances have GPS", "72% urban 4G", "~95% SMS coverage", "~50,000 serious injuries/yr", "<2% false positives", "50 scenarios across 69 wilayas", "5 DZD per incident", "200k DZD/month" pricing. See `11-…`.

## 5. Metrics protocol (so your slide numbers are real)
- **Latency:** phones and laptop on the same hotspot (clock offset < 1 s: check with a shared time page). 10 runs per channel, side-by-side screen recording of phone + dashboard; read the frames; report **median and p90**, n = 10, the operator used and the signal bars.
- **False alarms:** 30 drops from 1 m onto a cushion/floor, 20 hard brakes, 20 speed bumps (car, passenger seat), 10 min walking. Report "0 false countdowns in 80 staged events" **only if true**; if one occurred, report it and what you changed.
- **Witness speed:** 5 people who have never seen the app; time from opening to "sent"; median.
- **Codec:** `pnpm check` output on the slide (5,000 random packets, 100% round-trip, Python agrees).
- Put the date, device models and n on the slide. "Measured by us on a hackathon prototype" is a strength, not a weakness.

## 6. Jury Q&A — honest answers

1. **Is the severity score medically valid?** Not clinically validated, and we say so. It is a transparent points score whose *inputs* come from the 2021 ACS/NHTSA field-triage guideline and crash-physics research; physiology can force "critical", mechanism alone is capped at "serious". Weights are editable and uncalibrated. Step one of a pilot is calibration with SAMU doctors on real cases. A human always decides.
2. **False alarms?** Five layers: a speed gate (no detection unless driving), multi-signal rule (impact + speed drop + stop), a countdown with "I'm OK", a dispatcher-visible "auto, unconfirmed" badge until call-back or a witness merge, and per-sender rate limits. We measured N staged events (show numbers) and ran a drop test live.
3. **Who gets the SMS? Do you call 14?** The voice call to 14/1021 still happens: the app opens the dialler. The SMS goes to a NAJDA gateway number in the operations room (a phone today; an operator short code at scale). We add data next to the existing channel.
4. **No network at all?** The alert is queued and retried; SMS needs far less signal than data. In true dead zones nothing can leave the phone, which is why witnesses and passing vehicles matter; IoT/LoRa relays are on the roadmap.
5. **Hospital capacity data does not exist in Algeria.** Right, so we don't pretend: a curated capability table (neurosurgery, CT, ICU, pediatrics), an optional status a charge nurse can set in seconds, expiring after 6 h, and "unknown" shown as unknown. Our own worked example shows that the *closest* hospital isn't always the *best*, and that the choice involves a policy gate a doctor must approve.
6. **Why would people install another app?** Witnesses need no account; institutional push is the real lever (Protection civile/DGSN campaigns, insurers, fleets, driving schools); and the protocol matters more than our app: other apps or devices can emit the same 160 characters.
7. **Personal and health data?** Law 18-07 as amended by 25-11 treats health data as sensitive. The alert uses vital-interest grounds; the medical profile is a separate explicit opt-in and never travels by SMS; production hosting in Algeria; DPO and processing register; breach notice within 5 days. The demo uses synthetic data only.
8. **Who is liable if it's wrong?** It is decision support: the dispatcher chooses, every suggestion and override is logged with a reason, and the wording is "estimated risk". Liability stays with the existing chain of command; a pilot needs a protocol with the institution.
9. **Can someone fake an alert?** Yes, a CRC is an integrity check, not authentication, and we say so. Today: private gateway number, webhook secret, per-sender rate limits, "unconfirmed" until call-back/witness, and no automatic dispatch. Next: per-device keys and a short HMAC tag in v2 (the packet has the headroom).
10. **How does it scale to 69 wilayas?** Stateless web tier, PostGIS routing by wilaya, one national short code, OSRM for the whole country on one server. The bottleneck is adoption and agreements, not compute. Start with one wilaya on a high-traffic national road.
11. **Business model?** Public-safety infrastructure: free for citizens and operations rooms in a pilot. Potential revenue: fleet/telematics licences, insurer partnerships, anonymised black-spot analytics for road-safety bodies. **We have not validated prices and don't quote any.**
12. **Why not Google/Apple?** At the time of our research Pixel crash detection and Android ELS were not available in Algeria, iPhones are a minority, and those systems send *voice + location*, not a structured, merged, triaged picture with hospital orientation. We complement them.
13. **Why rules and not AI?** No Algerian training data exists; rules are explainable and auditable. NAJDA creates the dataset a future model would need (with consent), and the deployment path (calibration, then maybe a model) is explicit.
14. **What's real and what's simulated?** Real: the codec, scoring, ranking, merge (open tests), the dashboard, the HTTPS and SMS paths on real phones, the audit log. Simulated: sensor traces (replay), hospital capability data (curated/illustrative), vitals from a wearable, the operator short code (gateway phone). Say it before they ask.

## 7. Slide list (design in Figma; dark theme; 16:9; Bricolage numerals)
1 Cold open · 2 Problem (3 sourced numbers) · 3 Chain of lost minutes (6-step diagram) · 4 NAJDA in one picture (phone → packet → ops room → hospital) · 5 The packet (full-bleed `PacketLine`) · 6 Demo divider · 7 What we measured · 8 Validated vs assumed · 9 Built for Algeria (SMS, ar/fr, law, no hospital IT) · 10 Pilot roadmap & model · 11 Team & thanks. Max 20 words per slide. Appendix: architecture, scoring table, ranking worked example, sources.
