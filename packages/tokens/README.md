# @sellekni/tokens: design tokens

`tokens.json` is the single source of the colours (light and dark), type and spacing.
`pnpm tokens` builds `dist/tokens.css` (CSS variables for the web) and `dist/theme.ts` (React Native theme).
`pnpm --filter @sellekni/tokens test` checks the WCAG contrast of every text/background pair, and it runs in CI.

Fonts: IBM Plex Sans Arabic (UI), IBM Plex Mono (packets, numbers), Bricolage Grotesque (display).
Rules for using them are in the [design constitution](../../docs/guidelines/design-constitution.md).
