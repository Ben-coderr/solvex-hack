# 06 — Design & UX System (and the Figma workflow)

> Goal: a product that looks **designed for this exact job**, not generated. Judges see a deck and a demo for five minutes: the design has to be legible from 5 m on a projector and unforgettable in a single frame.
> Single source of truth for values: `packages/tokens/tokens.json` (WCAG-tested). Rules for Claude Code: `.claude/skills/najda-design/SKILL.md`.

---

## 1. Design intent

**"A calm instrument for the worst minutes of someone's day."**

Three principles, each with a consequence you can check:
1. **Glanceable under stress.** At most 3 controls on a panic screen; one primary action; huge numerals; no scrolling in the countdown. *Check: a stranger understands the Countdown screen in 2 seconds.*
2. **Honest about uncertainty.** Every estimate shows confidence, reasons and the disclaimer; every guess says it is a guess; the packet is visible. *Check: no number appears without its reasons within one tap.*
3. **Works when everything else doesn't.** Night-first dark theme, SMS-only mode designed as a first-class state (not an error), offline map. *Check: the "SMS only" state has its own composed screen.*

## 2. The signature (what makes it ours)

| Element | Idea | Where |
|---|---|---|
| **Packet-as-UI** | The 160-char DZ-MSD message is the product's *visual identity*: tokens (`R75H`, `T1432`, `D71`, `RO`, `FN`, `#04`) rendered as monospace chips with hairline borders. The user literally sees what travels over the air. | Alert status, incident detail, pitch slide, `/phones` |
| **Golden Ring** | A thin ring that fills over the golden window since impact; passes through three tick marks (10 / 30 / 60 min). A time pressure cue that is informative, not alarming. | Incident header, hospital ETA, countdown (as a draining ring) |
| **Triage markers** | Shape + letter + colour: R ▲ · O ◆ · Y ● · G ■ · U ◌(dashed). Readable in greyscale and by colour-blind users. | Map pins, queue rows, hospital cards |
| **Night Dispatch** | Warm graphite surfaces (not pure black), one electric-blue signal colour that is *not* a triage hue. Day theme = warm paper, not clinical white. | Everything |
| **Bilingual typography** | One family that covers Arabic and Latin natively, so ar/fr/en feel designed together. | Everything |

Logo/mark: design an **original** mark (e.g. concentric arcs + a pulse, or a calligraphic *ن*). **Do not use a red crescent, red cross or medical cross**: those emblems are legally protected, and borrowing them is a credibility risk. No ambulance clip-art.

## 3. Tokens (values live in `tokens.json`; measured on 2026-10-30)

**Colour roles.** Dark (default for dispatcher + Drive mode) / Light (day, projector-friendly):

| Role | Dark | Light | Measured |
|---|---|---|---|
| bg | `#0E1114` | `#F6F4EF` | text/bg 16.4:1 · 16.2:1 |
| surface / raised | `#151A1F` / `#1D242B` | `#FFFFFF` / `#FBFAF7` | text/surface 15.2:1 · 17.8:1 |
| line | `#2B343D` | `#D9D3C5` | 1.5:1 · 1.4:1 (quiet on purpose) |
| text / muted | `#ECEFF2` / `#9AA6B2` | `#14181C` / `#566270` | muted/surface 7.1:1 · 6.2:1 |
| brand text | `#9DB8FF` | `#1740B0` | 8.9:1 · 8.8:1 on surface |
| brand fill + on-brand | `#2B62F0` + `#FFFFFF` | same | 5.1:1 |

**Triage (reserved, never decorative):** R `#E5484D` · O `#F76B15` · Y `#FFC53D` · G `#30A46C` · U `#8B949E`; the letter inside is always ink `#14181C` (4.6–11.3:1). On dark surfaces every fill is ≥ 3:1 by itself. **On light surfaces O, Y, G and U fall below 3:1 (2.7 / 1.4 / 2.9 / 2.8), so markers carry a mandatory 2 px ink outline** (`triageOutline`). This is enforced by `pnpm --filter @najda/tokens test`.
Status colours (`ok / warn / danger / info`) exist for generic UI states and are kept visually distinct from the triage set.

**Type.** UI: **IBM Plex Sans Arabic** (covers Arabic + Latin). Packet/code: **IBM Plex Mono**. Big numerals (NSI, countdown, ETA): **Bricolage Grotesque**. Use **Western digits 0–9** in every language (standard in Algeria). Scale (px, 1.25 ratio): 12 · 14 · 16 (body min) · 20 · 25 · 31 · 39 · 49 · 61 (countdown). Line height 1.5 body / 1.15 display. Arabic needs +8% line height and no letter-spacing. Never fake bold on Arabic: use real weights (400/500/600).
Space 4-pt scale (4 8 12 16 24 32 48 64) · radius 8 / 12 / 20 / pill · touch target ≥ 48, SOS ≥ 72.
Motion: 120 / 200 / 360 ms; ease-out; the countdown ring is the only continuous animation; honour `prefers-reduced-motion`.

## 4. Component inventory (build in Figma first, then in code with the same names)

| Component | Variants / states | Notes |
|---|---|---|
| `TriageMarker` | band R/O/Y/G/U × size (pin 32, row 20, hero 64) × theme × selected/pulsing | shape + letter + colour + outline on light |
| `PacketChip` | token kinds (id, band, coords, time, physics, flag, vital, plus, crc) × state (ok / suspect / invalid) | monospace; copy on tap |
| `PacketLine` | full packet with wrap + char counter "93/160" | shows GSM-7 ok badge |
| `GoldenRing` | elapsed 0–60 min, ticks, paused | SVG |
| `CountdownRing` | 30 s drain, final 5 s urgent | big numerals inside |
| `SosButton` | idle / pressed (hold progress) / sending / sent | 72 dp, hold-to-confirm ring |
| `ChannelBadge` | https / sms / paste / witness × sent/retrying/acked/failed | icons, not emoji |
| `ReasonList` | 1–3 reasons + confidence pill H/M/L + disclaimer | the explainability unit |
| `IncidentRow` / `IncidentCard` | band, age, channel, unconfirmed, merged ×N | queue |
| `HospitalCard` | rank, ETA, score bar, capability matrix (✓ / missing), status + age, "nearest ED" tag, override | ranking explainer |
| `LifecycleBar` | 8 steps × done/current/blocked + human actor + time | each step is a button |
| `PreAlertCard` | incoming / acked / overdue (2 min) | hospital view |
| `WitnessStepper` | 5 steps with pictograms | one-hand use |
| `StatusBanner` | online / SMS-only / offline / replay / demo | persistent, never hidden |
| `LocaleSwitch` | ar / fr / en | mirrors layout |
| `EmptyState`, `ErrorState`, `Skeleton` | per screen | no blank screens |

## 5. Key screens (wireframe intent; mirror horizontally for Arabic)

**Countdown (mobile, dark, full screen, no scroll)**
```
┌────────────────────────────┐
│ ● REPLAY                   │  ← StatusBanner (only in demo)
│                            │
│          ╭──────╮          │
│        ╱    27   ╲         │  ← CountdownRing, numerals 61 px Bricolage
│        ╲  s      ╱         │
│          ╰──────╯          │
│   Êtes-vous blessé ?       │  ← 25 px, same line in AR above/below per locale
│   هل أنت بخير؟              │
│                            │
│ [   I'M OK   — cancel   ]  │  ← 72 dp, secondary style
│ [  SEND HELP NOW        ]  │  ← 72 dp, brand fill
└────────────────────────────┘
```
**Alert status (mobile)** — packet first:
```
 NAJDA1 K7Q2M R75H 36.47213,2.82871 …   ← PacketLine (chips, 93/160)
 ── Channels ──────────────────────────
 ✓ Dialler opened (14)      [ Call 14 ] [ 1021 ] [ 1055 ]
 ⟳ Internet: no connection  retry 40 s
 ✓ SMS sent · delivered     GW1 +213…
 ── Received by rescuers  14:33 ──  ← appears on ACK, GoldenRing starts
 ┌ What to say ───────────────┐   ← 4 lines: where (Plus Code), how many, danger, call-back
```
**Dispatcher home (web, dark, 1366×768 minimum)** — left queue (360 px), right map, top status strip (online / realtime / SMS gateway alive / OSRM / clock), bottom lifecycle bar when an incident is selected. Detail opens as a right drawer (480 px), never a modal. Data text ≥ 18 px for projection.
**Incident detail:** header = TriageMarker (hero) + `R 75` + confidence pill + GoldenRing · `ReasonList` · `PacketLine` + raw SMS (copy) · report timeline · resource hints · call-back / copy coordinates / open in OSM · tabs: Orientation | Reports | Audit.
**Orientation:** three `HospitalCard`s ranked, with the capability matrix as a row of dots (filled = has, outlined = missing), ETA in big numerals, route highlighted on map on hover, "nearest ED" tag, **Pre-alert** primary button, "Override…" asks for a reason.

## 6. Arabic / RTL rules
- Set `dir="rtl"` at the root and use **logical** properties only (`margin-inline-start`, `ps-*`, `text-start`; RN: `marginStart`, `I18nManager.forceRTL` + restart). Never `left/right`.
- Mirror: back arrows, progress direction, swipe-to-cancel, lifecycle bar direction. Do **not** mirror: play/media icons, numbers, packet text (always LTR: wrap in `dir="ltr"` / `unicode-bidi: isolate`), maps, clocks.
- Mixed-script strings (Arabic sentence with `K7Q2M`): isolate the Latin run with bidi isolates.
- Test every screen in **ar + dark** before calling it done. Layouts must survive +30% text growth (French is longer than English; Arabic taller).
- Copy deck: write in Arabic and French first; short imperatives; no medical jargon on the phone ("Êtes-vous blessé ?" / "هل أنت بخير؟").

## 7. Accessibility checklist
Contrast tests pass · targets ≥ 48 dp · focus rings (brand, 3:1) on web · every icon-only button labelled · screen-reader order = visual order in RTL · haptics + sound + visual for the countdown · no information by colour alone · reduced motion · text can scale to 200% without clipping · the countdown alarm must be audible with the ringer on silent (test on the demo phones and decide how to present this to the user in onboarding).

---

## 8. Figma workflow — pick the path that matches your seat

You asked for Figma to be central. Facts (verified 2026-10-30): the Figma MCP server is available on Starter and paid plans; **writing to the canvas needs the *remote* server and a Full seat** and is free during the beta, "eventually usage-based". The official help page gives no call limits: check *Plans, access, and permissions* in Figma's help centre before depending on it. Tools listed in Figma's docs when this pack was written (names can change; trust `/mcp` in your session): `get_design_context`, `get_screenshot`, `get_metadata`, `get_variable_defs`, `create_design_system_rules`, Code Connect tools, and (remote only) `use_figma` (beta), `generate_figma_design`, `create_new_file`, `generate_image`.

Install (one of): `claude plugin install figma@claude-plugins-official` then `/plugin` → figma → authenticate · or `claude mcp add --transport http figma https://mcp.figma.com/mcp` then `/mcp` → figma → Authenticate. Skills: `figma-implement-design`, `figma-use`.

| Path | When | Flow |
|---|---|---|
| **A — Claude builds in Figma** (best) | Someone on the team has a Full seat | Claude Code + `use_figma` creates the file: variables from `tokens.json`, styles, components, the 21 screens; the designer then refines by hand; code is generated from frames with `get_design_context` |
| **B — Designer builds, Claude implements** | Full seat but you want human craft | Designer follows §4–§5 + this doc; Claude Code reads frames (`get_design_context` + `get_screenshot`), implements with Code Connect mappings |
| **C — Token-first, Figma as the visual deliverable** | No Full seat / unknown call limits | Build the UI in code from tokens (the `najda-design` skill + `frontend-design` skill), keep screenshots; recreate/capture into Figma later (`generate_figma_design` if you get access, or manual) for the jury deck. **Never block the build on Figma.** |

**Figma file structure:** pages `00 Cover` · `01 Foundations` (colour/type/space/radius variables, grid, icon set) · `02 Components` · `03 Mobile` · `04 Web` · `05 Flows` (hero flow storyboard) · `06 Pitch assets`.
**Variables:** collections `Primitives` (raw values) → `Semantic` (bg, surface, text, brand, triage.*) with modes **Dark/Light**; a `Locale` mode only if layouts differ. Component names = code names (`TriageMarker`, `PacketChip` …) so Code Connect maps 1:1. Use auto-layout everywhere; build RTL variants for the 6 most important screens.
**Prototyping:** link the hero flow (Countdown → Alert status → ACK) and the dispatcher flow (pin → detail → orientation → pre-alert) so the judges can click through if the live demo fails.

### 8.1 Prompts to paste into Claude Code

**(1) Build the design system in Figma** *(Path A)*
> Use the Figma MCP. Create a new Figma file "NAJDA — Design System". Read `packages/tokens/tokens.json` and docs/06 §3–§4. Create variable collections Primitives and Semantic with Dark/Light modes exactly matching the tokens (names: `bg, surface, raised, line, text, muted, brand/*, triage/R…U, onTriage/*`). Create text styles from the scale in §3. Build the components in §4 with variants and states, using auto-layout, named exactly as listed. Put TriageMarker on its own frame in all bands × sizes × themes (light themes include the 2 px outline). After each group, take a screenshot, check contrast and RTL, and fix. Don't use any colour that isn't a variable.

**(2) Design the screens** *(Path A)*
> Using the NAJDA design-system file, design the 12 mobile screens and 9 web screens listed in docs/03 §5, following the wireframe intent in docs/06 §5. Every screen: dark + light, ar (RTL) + en, plus loading/empty/error/offline/SMS-only variants for Home, Alert status and Dispatcher home. Use real packet text from docs/05 §1.2. Prototype the hero flow and the dispatcher flow.

**(3) Implement a frame** *(A or B)*
> Use `get_design_context` and `get_screenshot` for this Figma frame: <link>. Implement it in `apps/<mobile|web>` using only `@najda/tokens` and the existing components (`TriageMarker`, `PacketChip` …). Map new components with Code Connect. Match spacing and type exactly; support RTL and dark; then run the app, screenshot at 360/768/1440 and compare with the Figma screenshot; list differences and fix them.

**(4) Design critique** *(any path)*
> Act as a senior product designer with emergency-services experience. Review these screenshots against docs/06: glanceability under stress, honesty about uncertainty, triage-colour discipline, RTL correctness, contrast, and "does this look generated?" (generic cards, default fonts, gradients, emoji icons). Give a numbered list of the 10 highest-impact fixes, each with the exact component and token to change.

## 9. "Does it look generated?" — anti-patterns we ban
Inter/Roboto/system font look · purple-blue gradients · identical rounded cards in a 3-column grid · emoji as icons · stock "medical cross" iconography · decorative use of red/green · glassmorphism on a panic screen · placeholder lorem ipsum · unlabelled charts · centred-everything layouts · drop shadows doing the job of hierarchy.

## 10. Design QA before every demo rehearsal
1. Squint test (blur 8 px): can you still see band, time and the one primary action? 2. Greyscale test: markers still distinct? 3. Projector test at 1366×768 from 5 m. 4. `ar` + dark pass on all 21 screens. 5. Offline: unplug the network, every screen still renders. 6. Reduced-motion pass. 7. 200% text pass.
