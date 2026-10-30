# Medical Language and Claims Guidelines

- Sellekni is decision support. Wording: "estimated risk", "suggested", "recommended for review". Never: "diagnosis", "the patient has", "AI decided", "guaranteed", "saves lives" (as a fact).
- Every severity display shows: band + score + confidence + top-3 reasons + the fixed line "Estimated risk, not a diagnosis. Confirm by call-back." Each is localised in ar/fr/en.
- Humans decide. Every state change, override and pre-alert is a human click, with the actor and a reason logged.
- Never claim a statistic we did not source. Allowed: only the figures in `docs/10-PITCH-DEMO-QA.md` section 4 "Safe claims" (the unsourced numbers listed there are banned). Anything else is labelled ASSUMPTION or HYPOTHESIS. Never state "minutes saved in Algeria" as a fact: say "the pilot will measure it".
- It is rules, not AI. Do not call the scoring "AI" or "machine learning".
- Demo data is synthetic. Facility names in seed data are labelled "(illustrative)" until verified with a real source.
- Emergency numbers in the UI: Protection civile 14 / 1021, Gendarmerie 1055, Police 17 / 1548. Do NOT show a national SAMU number (unconfirmed). The app opens the dialler; it never auto-places a call without the user.
