# Q&A sheet — print, one copy per speaker

Answer in ≤ 20 s, then stop. If you don't know: "We haven't measured that; it's the pilot's first task." Never quote a number
that is not in docs/10 §4. It is **rules, not AI**; the output is **estimated risk, not a diagnosis**; **humans decide**.
Hackathon prototype, synthetic data, not an official emergency service. We have **no** agreement with Protection civile,
SAMU, the Gendarmerie or any hospital — don't imply one.

**Q&A format (SolveX): 4 minutes.** Listen to the whole question. Answer in 20–30 s so the jury can ask 3–4 questions.
Split by domain: technical / SMS / code → speaker 2 or 3 · medical / triage / hospital → the product teammate ·
business / legal / insurers → speaker 4. Open with one line that takes the question seriously, then answer.

## 0. The 8 classic jury questions (from the SolveX jury guide), answered in French
The guide's suggested answers contain claims we can't back. These are the corrected versions; the "don't say" column
is what the guide proposed and why it's out.

| # | Question | Réponse (20 s) | Don't say |
|---|---|---|---|
| 1 | Fausses alertes si le téléphone tombe ? | « Trois filtres : la détection ne s'arme qu'au-dessus de 25 km/h ; il faut un choc soutenu, une chute de vitesse GPS et un arrêt du véhicule ; puis 30 s d'alarme et de voix avec un gros bouton "Ça va — annuler". Côté opérateur, l'alerte reste "AUTO · NON CONFIRMÉE". Notre taux de fausses alertes n'est pas encore mesuré. » | "30 km/h" (our gate is 25), "zéro fausse alerte" |
| 2 | Et sans aucun réseau, même pas 2G ? | « Le paquet reste en file d'attente sur le téléphone et repart dès qu'une barre revient. Un témoin qui passe peut aussi signaler. Dans une vraie zone blanche, rien ne sort du téléphone : c'est la physique. » | that a passing driver "relays" the victim's packet: relays are roadmap |
| 3 | Disponibilité des lits sans système central ? | « Nous ne prétendons pas l'avoir : ce flux n'existe pas. Une table des capacités fixes (urgences 24 h, scanner, réanimation, chirurgie) plus un statut simple que l'équipe de garde met en quelques secondes, qui expire après 6 h. "Inconnu" s'affiche comme inconnu. Nos données hospitalières sont illustratives. » | "jamais orienté vers une structure sans scanner" as a guarantee |
| 4 | Loi 18-07 ? | « Les données de santé sont sensibles (loi 18-07 modifiée par la loi 25-11). Pas de suivi hors alerte ; l'alerte part pour sauvegarde de l'intérêt vital ; le profil médical est un opt-in séparé et ne voyage jamais par SMS ; hébergement de production en Algérie ; revue juridique avant tout déploiement réel. La démo n'utilise que des données synthétiques. » | "Absolument conforme", "décret d'application 25-11" (25-11 is cited to us as an amending law; we haven't verified a decree) |
| 5 | Pourquoi pas Google ELS ou Apple ? | « Au moment de nos recherches, la détection de choc Pixel et Android ELS n'étaient pas disponibles en Algérie, et environ 87 % des téléphones sont sous Android. Ces systèmes envoient voix et position, pas un rapport structuré fusionné avec une orientation hospitalière. Nous les complétons. » | "iPhone = 13 %" (not in our sources), "Apple ne marche pas en Algérie" (not verified) |
| 6 | Score validé médicalement ? | « Non, et nous le disons. Des points transparents ; les critères viennent du guide de triage de terrain ACS/NHTSA 2021 et de la physique du choc ; les poids ne sont pas calibrés. C'est un risque estimé, pas un diagnostic ; un humain décide. Calibrer avec des urgentistes est la première tâche du pilote. » | "critères de Vittel" (we didn't use them; say it only if you can explain them) |
| 7 | Pourquoi installer l'app ? | « Le témoin peut utiliser le mode témoin de l'app (5 touches) ou, sans rien installer, un lien web, sans compte. Pour les conducteurs, le levier est institutionnel : une campagne avec les secours, les auto-écoles, les flottes. Un avantage d'assurance est une piste à tester avec les assureurs, pas un accord. » | windscreen QR code (not built), insurance discount as fact |
| 8 | Combien pour la Protection civile ? | « Pendant le pilote : rien à acheter. Le tableau de bord tourne dans un navigateur sur les PC existants. Les coûts réels à l'échelle sont l'hébergement en Algérie, les SMS et un accord de numéro court : nous n'avons pas de devis, donc pas de chiffre. » | "zéro coût" at scale |

**Guide claims we deliberately left out of the pitch** (no source in docs/10 §4): "18 minutes" to a usable location,
"230 milliards DZD / 1 % du PIB", "20 % des blessés graves subissent un transfert secondaire mortel", "13 % iPhone",
"14 g" in the demo script (phones saturate at ±8–16 g, so we never show a g-force), "+10 min = +4 % de survie" (D3 is
an odds ratio of *death*, OR 1.04, French physician-staffed EMS), "nous faisons gagner 10 minutes", Bouira as the
pilot wilaya (not agreed with anyone), insurers and telecom operators named as partners, "boîtier à 30 000 DZD".

## A. The base bank (docs/10 §6, corrected by docs/15 §4)

| # | Question | Answer |
|---|---|---|
| 1 | Is the severity score medically valid? | No, and we say so. Transparent points; *inputs* from the 2021 ACS/NHTSA field-triage guideline and crash-physics research. Weights uncalibrated. Calibration with emergency physicians is the pilot's first task. A human decides. |
| 2 | False alarms (speed bumps, dropped phone)? | Gates: armed only above 25 km/h, sustained impact, GPS speed collapse, vehicle stops; then a 30 s "I'm OK" countdown; "AUTO · UNCONFIRMED" for the dispatcher until a call-back or a witness. Tested on 10 synthetic scenarios (2 crashes, 8 non-crashes). **No false-positive rate yet** — staged tests on real phones are running. |
| 3 | Who gets the SMS? Do you call 14? | The call to 14/1021 still happens: the app opens the dialler. The SMS goes to a gateway number in the operations room (a phone today; an operator short code at scale). |
| 4 | No network at all? | Queued and retried; SMS can get through where data is weak. True dead zone: nothing leaves the phone — that's why witnesses matter; relays are roadmap. We have **not** measured Algerian coverage. |
| 5 | Hospital capacity data doesn't exist. | Right. Curated capability table, an optional status a charge nurse sets in seconds (expires after 6 h), "unknown" shown as unknown. Our hospital data is illustrative/unverified. |
| 6 | Why install another app? | Witnesses need no account: witness mode in the app (5 taps) or just a web link. The real lever is institutional push. And the protocol matters more than the app: any device can send the same 160 characters. |
| 7 | Personal and health data? | Law 18-07 as amended by 25-11: health data is sensitive. Alert on vital-interest grounds; medical profile is a separate opt-in and never travels by SMS; production hosting in Algeria; legal review before any real deployment. Demo = synthetic data. |
| 8 | Who is liable if it's wrong? | Decision support: the dispatcher chooses; every suggestion and override is logged with actor and reason. Liability stays with the existing chain of command; a pilot needs a written protocol with the institution. |
| 9 | Can someone fake an alert? | Yes — the CRC is integrity, not authentication. Today: private gateway number, webhook secret, rate limits, "unconfirmed" until call-back, no automatic dispatch. Next: per-device keys and an HMAC tag. |
| 10 | How does it scale? | Stateless scoring, a versioned protocol, a per-wilaya hospital registry: pilot → corridor → regional. **No capacity numbers yet.** The bottleneck is agreements, not compute. |
| 11 | Business model? | Not decided. Hypotheses and the tests we'll run are on the BMC slide. **No prices.** |
| 12 | Apple/Google already detect crashes. | On some recent phones. At research time Pixel crash detection and Android ELS were not available in Algeria; they send voice + location, not a structured, merged picture with hospital orientation. We complement them. |
| 13 | Why rules and not AI? | No Algerian training data; rules are explainable and auditable. A model could come after calibration, with consent-based data. |
| 14 | What's real, what's simulated? | Real: codec, scoring, ranking, merge (tests), dashboard, HTTPS and SMS paths, audit log. Simulated: sensor traces (replay), hospital data (illustrative), wearable vitals, the short code (a gateway phone). Say it before they ask. |
| 15 | Why SMS and not just 4G? | We send over the internet first and fall back to SMS, which needs only the voice/SMS network. Coverage numbers: not measured; we'd ask the operators. |
| 16 | Why a phone, not a box in the car? | A box sees the real crash pulse; a phone saturates — so we use how long, not how hard. A box is roadmap; the phone needs nothing installed, which makes a pilot possible. |
| 17 | What was prepared before the event? | Protocol, scoring, detector packages and the design system — disclosed. Apps, dashboard and integration were built during the event. |
| 18 | Why not read the airbag from the car's OBD port? | There is no standard OBD signal for "airbag deployed"; it is specific to each manufacturer. A code like B0001 is an airbag-circuit fault, not a deployment. That's one reason our roadmap has our own sensor box. The OBD link would give wheel speed, a sharper speed drop. Roadmap, not built for this demo. |
| 19 | Your radar predicts accident risk? | Not in this product. A teammate's prototype warns before known black spots (sourced, traced on OpenStreetMap). We quote no accuracy: there is no Algerian data to validate a risk model yet. Roadmap. |

## B. Ten harder questions

| # | Question | Honest answer |
|---|---|---|
| 1 | **Privacy:** "So your app tracks my location all the time?" | No. Location is read by the phone; it leaves the phone only inside an alert, after onboarding consent. No account for witnesses; microphone off; no audio recorded. The packet carries no name or phone number — the operations room sees the sender number only because that's how SMS works. |
| 2 | **Privacy:** "Who can see the incidents? Could a hospital browse every crash?" | Role-based access in the database: dispatchers see the queue; a hospital sees only incidents it was pre-alerted for (we tightened that ourselves in our security review). Every view-changing action is audited. |
| 3 | **Liability:** "Your ranking sent the patient to the wrong hospital and they died. Who answers?" | The ranking is a suggestion with its reasons; the dispatcher (or doctor) chooses and the choice is logged with a reason. A pilot needs a protocol signed with the institution before any real use. We would not deploy without it. |
| 4 | **False alarms:** "A thousand false alerts a day will drown the operators. Then what?" | We don't know the rate yet and won't pretend. That's why: countdown first, "AUTO · UNCONFIRMED" label, nothing dispatched automatically, rate limits, and the dispatcher cancels it as "False alarm…" with a recorded reason. The pilot measures the rate before scaling. |
| 5 | **False negatives:** "What if it misses a real crash?" | Then the person calls as today — we never replace the call. The SOS button and the witness link are manual paths. Missed-detection rate: also unmeasured; real traces are the pilot's job. |
| 6 | **Rural coverage:** "The roads where people die have no signal." | Partly true, and we can't fix physics. SMS needs less than data, the alert queues and retries when a bar comes back, and a passing witness can send. In a true dead zone nothing can leave the phone. We haven't measured coverage; we'd ask operators for maps. |
| 7 | **Cost:** "What does it cost to run?" | The prototype runs on free tiers plus SIM credit. Production cost drivers: SMS (roughly one acknowledgement and one pre-alert per incident), hosting in Algeria, an operator short-code agreement. **We have no quote, so no figure.** |
| 8 | **Why not eCall?** "Europe has eCall. Why not just mandate a 112-style system?" | eCall needs a box in new cars and a national public-safety answering point that receives it; that's a decade and a law. Our packet is *inspired* by eCall's minimum data set but runs today on the phones people already own, and on plain SMS. They're complementary: if Algeria adopts an eCall-type standard, our ops-room side can receive it. |
| 9 | **Adoption:** "What if the operator just doesn't use your dashboard?" | Then the alert still reaches them as a readable SMS — 160 characters a human can read without our software — and the call still happens. The dashboard has to earn its place by saving the operator effort; co-designing with an operator is what we ask for. |
| 10 | **Abuse:** "Kids will spam it as a prank." | Per-sender and global rate limits, unconfirmed until a call-back, no automatic dispatch, and every alert carries the sender — same deterrent as a prank call today. Per-device keys are next. |

**Before you answer a number:** is it in docs/10 §4? If not, don't say it.
