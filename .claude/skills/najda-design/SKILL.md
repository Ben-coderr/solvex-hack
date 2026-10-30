---
name: najda-design
description: NAJDA design constitution. Use whenever you create or change ANY UI (Expo screens, Next.js pages, components, Figma frames). Enforces tokens, triage-colour rules, Arabic RTL, accessibility, and the signature components so the product looks unique and never generic.
---

# NAJDA design constitution

Read `docs/06-DESIGN-AND-UX.md` for the full system. These rules are non-negotiable.

## Tokens
- Colours, spacing, radii and fonts come ONLY from `@najda/tokens` (`packages/tokens/tokens.json`). No raw hex, no magic numbers in components.
- Need a new value? Add it to `tokens.json`, run `pnpm tokens`, and make `pnpm --filter @najda/tokens test` pass (it measures WCAG contrast).

## Triage colours are reserved
- Red/orange/yellow/green/grey mean R/O/Y/G/U triage bands and NOTHING else. Never use them for decoration, charts, brand or generic success/error states (use `status.*` tokens for those, and keep them visually distinct).
- Every band marker = SHAPE + LETTER + COLOUR (R ▲, O ◆, Y ●, G ■, U ◌ dashed). Colour alone is never enough (colour-blind users, glare, projectors).
- On light surfaces every triage marker carries the 2 px `triageOutline`.
- Use the single `<TriageMarker band="R" />` component. Do not re-implement it.

## Typography & language
- UI: IBM Plex Sans Arabic. Packet text and codes: IBM Plex Mono. Big numerals (NSI, countdown, ETA): Bricolage Grotesque.
- Never Inter/Roboto/Arial/system-default look, never purple-on-white gradients, never emoji used as icons (use lucide icons).
- Use Western digits 0-9 in Arabic, French and English alike.
- Ship ar (RTL), fr and en. Use logical properties only (`ms-/me-/ps-/pe-/start/end`, `marginInlineStart`...). Mirror directional icons. Never hard-code left/right. Test every screen in `ar` + dark.

## Interaction & accessibility
- Touch targets >= 48 dp; the SOS / "Send help now" control >= 72 dp. Body text >= 16 px. Text >= 4.5:1 contrast (the token test enforces it).
- One primary action per screen. Panic-state screens (countdown, SOS) have at most 3 controls and no scrolling.
- Respect reduced motion. UI transitions <= 200 ms. The countdown ring is the only continuous animation.
- Every screen defines all states: loading, empty, error, offline, and "degraded: SMS only". No blank screens.

## Signature components (use them, extend them, don't replace them)
- `PacketChip`: renders DZ-MSD tokens as monospace chips. The product's visual signature ("the packet IS the UI").
- `GoldenRing`: elapsed-time ring since impact.
- `TriageMarker`: see above. `ReasonList`: top-3 reasons + confidence + the disclaimer.

## Definition of done for UI work
Screenshot at 360, 768 and 1440 px, light + dark, `en` + `ar`; fix overflow, truncation and mirrored-layout bugs before reporting done.
