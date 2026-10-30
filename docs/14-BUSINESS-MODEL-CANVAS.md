# 14 — Business Model Canvas for Sellekni (سلّكني)

> **Status:** hypotheses to validate, not facts. The old plan (PLAN_V3 §15.4) had a nine-block BMC with prices (*SaaS SAMU 200 000 DZD/month, OBD 3 500 DZD*) and a per-incident cost (*5 DZD*): **none of those numbers had a source, and no buyer had been interviewed**, so none of them appear here. A jury that knows business will ask "who pays, why, how do you know?". The honest answer is: *here is who we think pays, here is the experiment that tests it, and here is what we have already verified.* (The canvas has **nine** blocks; the old plan's "8 blocs" line was a typo.)
>
> Drawing: `docs/diagrams/06-bmc.svg`. Ownership suggestion: role D (design + pitch) with C (data).

## 0. The one-sentence model
**Sellekni is a public-safety data layer that is free for the people who send alerts and for the emergency services that receive them during the pilot; money, if any, comes from organisations that benefit from faster, better-structured crash reports (institutional licences, fleets, insurers, road-safety analytics) and from non-dilutive funding — all to be validated.**

## 1. Verified context (sourced — safe to say on stage)
| Fact | Source |
|---|---|
| Algeria 2025: **26 976 road accidents, 3 838 deaths, 37 020 injured** (+2.68 %, +2.62 %, +4.9 % vs 2024) | DNSR director of studies, reported by [Atlas Magazine, 24 Feb 2026](https://atlas-mag.net/fr/articles/hausse-des-accidents-sur-les-routes-algeriennes-en-2025) |
| The DNSR attributes **more than 96 %** of accidents to the human factor (speeding, lack of vigilance); motorcycles were involved in 24 % of accidents in large cities (31 Dec 2025) | same |
| Heavy vehicles (buses, coaches, lorries) are a stated driver of the 2025 trend; chain collisions raise casualties per incident | [Algérie360, 8 Dec 2025](https://www.algerie360.com/hausse-des-accidents-en-2025-la-dsnr-designe-les-2-vehicules-a-problemes/) *(this article's own accident total looks inconsistent with the annual figure — quote only the qualitative point)* |
| Insurance market 2024: total premiums **≈ 172 bn DZD**; **motor ≈ 71.55 bn DZD = 41.6 %** | Direction Générale du Trésor data, tabulated by [Atlas Magazine](https://atlas-mag.net/fr/articles/clone-marche-algerien-de-lassurance-en-2024-chiffre-daffaires-par-branche) |
| **Startup label**: Algerian-law company < 8 years old, ≤ 250 employees, innovative model, ≥ 50 % of capital held by natural persons / approved funds / labelled firms; tax exemption for 4 years; equipment VAT-exempt and 5 % customs; eligibility for the Algeria Startup Fund. **Projet innovant** label for a project with no company yet (2 years, renewable twice). Decided by a national committee (≥ 2 meetings/month, 30-day answer) | [UpGrowth summary of decrees 20-254 / 25-311](https://www.upgrowth.dz/questions/label-startup-projet-innovant-algerie) *(commercial summary — read the decrees before filing)* |

**Not verified — do not say:** "18 minutes to dispatch", "72 % 4G", "~95 % SMS coverage", "< 30 % of ambulances have GPS", "5 DZD per incident", "X lives saved". If you want any of these, ask Protection civile / SAMU / the operators in writing and cite them.

## 2. The canvas

| Block (FR) | Content — **H** = hypothesis to test · **V** = verified |
|---|---|
| **Customer segments** (Segments de clientèle) | **S1 Senders (free):** drivers and passengers with Android phones; **witnesses** with no account (web/5 taps). **S2 Receivers (pilot free, payer TBD):** emergency operations rooms (Protection civile 14, SAMU, Gendarmerie, police), receiving hospital EDs. **S3 Payers (H):** fleet/transport operators, insurers (motor = 41.6 % of premiums **V**), road-safety authorities (aggregate analytics), employers with driving staff |
| **Value propositions** (Propositions de valeur) | **Sender:** "if I cannot call, my phone does — with my position — and I stay in control (countdown, *I'm OK*)"; works on weak data through plain SMS. **Operations room:** one merged, de-duplicated, located report with an *explainable* severity estimate and a hospital recommendation by capability × travel time; human decides; audit trail. **Hospital:** a pre-alert with mechanism and ETA, with acknowledgement. **Payers (H):** structured, time-stamped crash data; faster first notification |
| **Channels** (Canaux) | Pilot: sideloaded APK + shared web link for the dashboard and witness page; later: app store (the `SEND_SMS` permission is Play-restricted — plan the policy route or the SMS-composer fallback); partnerships with Protection civile / SAMU training days, driving schools, university campuses, fleets; road-safety awareness campaigns (DNSR) |
| **Customer relationships** (Relations clients) | Co-design with a small group of operators (weekly feedback); operator training day (the web UI is standard); in-app *false-alarm* feedback loop; SMS/ACK so senders see "received"; a named contact at each pilot partner |
| **Revenue streams** (Sources de revenus) | **Today: none.** Candidates, in the order we would test them: (1) **non-dilutive funding** — competition prizes, incubators, the Algeria Startup Fund after labelling **V**; (2) **institutional licence / support contract** for the operations-room software (price only after interviews); (3) **fleet / insurer subscription** (crash notification + data export); (4) **aggregate, anonymised black-spot analytics** for road authorities (needs a legal basis). *No price is claimed.* |
| **Key resources** (Ressources clés) | The tested protocol + scoring + ranking package (`@sellekni/shared`, 67 tests + an independent Python implementation); the detector and replay traces (`@sellekni/detector`, 21 tests); the design system; a verified hospital-capability registry (**to build, clinician-reviewed**); relationships with operators and clinicians; the team |
| **Key activities** (Activités clés) | Build/maintain app + dashboard; **collect real driving traces and retune the detector**; verify hospital data; clinical review of the scoring; operator training; privacy/legal compliance; pilot measurement |
| **Key partners** (Partenaires clés) | Protection civile / SAMU (operators, ground truth); hospitals and the health ministry (capabilities, ED contacts); DNSR (data, campaigns); telecom operators (SMS short code / gateway, coverage data); universities / emergency physicians (clinical review); incubators and the startup-label committee; later insurers, fleets |
| **Cost structure** (Structure de coûts) | Team time (the main cost); cloud (free tiers now → paid at pilot scale); SMS gateway SIMs and messages; map/route hosting (OSRM tiles); clinician and legal review; trademark/domain checks (INAPI); test devices; **hardware and homologation only on the roadmap** (docs/16) |
| **Impact** (extra block for a public-safety project) | How we would *know* it works — measured in the pilot, never claimed before: median/p90 time from impact to a located report on the operator's screen; share of reports located within X m; duplicates merged; false alarms per 100 driving hours; operator trust score; hospital pre-alert acknowledgements |

## 3. Why this is credible (and where it is weak)
- **Strong:** the receivers are public services, so "free in the pilot" is natural and avoids a procurement fight; the senders are free, which removes the adoption barrier; the data we produce (structured, located, time-stamped) is valuable to several parties; non-dilutive routes exist and are verified.
- **Weak (say it before the jury does):** the payer is not identified; public buyers are slow; the Play-store SMS permission is restrictive; **liability and privacy** (law 18-07 is cited in the old docs — verify the current text) must be solved before any real deployment; adoption by an operations room needs trust we do not have yet.
- **Counter-risk — competition and originality.** *We have not found an Algerian app that combines phone-based crash detection, a structured SMS fallback and an operations-room view with a hospital recommendation* — but our search was limited. What we did find: **SafeRoad DZ** (community hazard and checkpoint alerts with voice alerts; its site mentions no crash detection or SOS), a few other road-information and reporting apps (Allo Chorta, SOS El Djazaïr, Info Trafic Algérie — **not verified**; one site could not be opened), and **built-in crash detection on newer iPhones and Pixels** (availability and local-emergency integration in Algeria **not verified**). International precedents of "push location to the dispatcher" exist, e.g. the Belgian **112 BE** app sends your position to the emergency centre as soon as you call and updates it every 30 s ([police.be](https://www.police.be/5288/questions/vous-etes-victime/lapp-112)). *The old plan's claim "no equivalent app in Algeria" must not be used.* Say instead: **"we complement the call, we work when data is weak, and we give the operator a structured, explainable picture."**

## 4. Experiments before money (what makes the canvas credible)
> With 24 hours left none of these can run before the pitch: show them as **the next steps**, not as results.

| Riskiest assumption | Cheapest test | Evidence to bring |
|---|---|---|
| Operators will use a structured report from an unknown source | 3 short interviews + a 15-min screen-share demo with the simulated dashboard | notes, quotes, their objections |
| A hospital ED wants a pre-alert | 2 interviews with ED staff | what they need in the pre-alert, in their words |
| Drivers accept background sensing | 8 drivers, 5-min walkthrough + onboarding test | completion rate, where they stop |
| Someone will pay | ask 3 fleet managers and 2 insurers: *"how do you learn about a crash today, how long does it take, what would it be worth?"* — **do not pitch a price** | their current process and cost of delay |
| The label route works | read decrees 20-254 / 25-311; book the incubator slot | a one-page eligibility check |

## 5. Slide order for the BMC (1 slide, 40 s)
Left to right as the canvas, but read it in this order: **Segments → Value → Channels → Revenue (honest "hypotheses, tested next") → Impact metrics**. Put the **"Verified"** facts of §1 in a footer with the source names. If asked about price: *"We have deliberately not set one — we will not invent a number before talking to the people who would pay."*
