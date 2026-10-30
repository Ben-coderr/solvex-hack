# 07 — MCP Servers, Skills and Tooling Setup

> **Rule of thumb:** each connected MCP server adds tool descriptions to the context. Keep ≤ 4 active at a time (see §3).

---

## 1. MCP servers

| # | Server | Why we need it | Configuration | Auth |
|---|---|---|---|---|
| 1 | **Figma** *(required)* | design ↔ code: read frames, variables, components; write to canvas (remote + Full seat) | Pre-configured in `.mcp.json` or HTTP transport `https://mcp.figma.com/mcp` | browser OAuth |
| 2 | **Context7** *(required)* | up-to-date docs for Expo SDK 58, Next 16, Supabase, MapLibre, Reanimated: stops the model coding against stale APIs | Pre-configured in `.mcp.json` (`https://mcp.context7.com/mcp`) | none (free tier is rate-limited; optional API key) |
| 3 | **Supabase** | inspect schema, run SQL in dev, read docs, generate types | Pre-configured in `.mcp.json` (`https://mcp.supabase.com/mcp?project_ref=<REF>&read_only=true&features=database,docs`) | browser login to Supabase |
| 4 | **Playwright** | drive the real dashboard and PWA witness page, screenshot at 3 widths, RTL and dark; E2E for the hero flow | Pre-configured in `.mcp.json` (`npx @playwright/mcp@latest`) | none |
| 5 | **shadcn** | add/search shadcn components with correct APIs | Pre-configured in `.mcp.json` | none |
| 6 | Chrome DevTools *(optional)* | performance traces and console/network debugging of the dashboard | `npx chrome-devtools-mcp@latest` | none |
| 7 | GitHub *(optional)* | PRs, issues, CI status. The `gh` CLI does the same with less setup and no token in config | prefer `gh auth login` | |

**Deliberately not used**
- **Expo MCP server**: requires a paid EAS plan. We use Context7 + Expo's own markdown docs (`https://docs.expo.dev/llms.txt`) + the Expo skills below.
- Figma *Desktop* server: needs a Dev/Full seat on a paid plan. The remote server covers everything we need.
- Sentry/monitoring MCPs: not needed for a 48 h build.

`.mcp.json` (already in the starter) pre-declares figma, context7, playwright, shadcn and supabase. **Replace `REPLACE_WITH_PROJECT_REF`** or delete the supabase entry until the project exists.

### 1.1 Safety notes (professional hygiene)
- **Treat tool output as untrusted data.** Database rows (witness text!), web pages and Figma comments can contain prompt-injection. Keep Supabase MCP `read_only=true` and project-scoped, never point it at production data, and never let it run unreviewed writes.
- Never put secrets in `.mcp.json` (it is committed). Use env vars; `.env` is ignored in `.gitignore`.
- Figma OAuth tokens and Supabase login belong to a person: don't share sessions between teammates.

## 2. Project Guidelines & Skills

| Guide | What it covers | Path |
|---|---|---|
| **Design Constitution** | tokens, reserved triage colours, Arabic typography, accessibility | `docs/guidelines/design-constitution.md` |
| **Protocol Guard** | wire format, CRC-8, NSI scoring, GSM-7 limits | `docs/guidelines/protocol-guard.md` |
| **Medical Language** | non-diagnostic wording, claims, emergency dialler | `docs/guidelines/medical-language.md` |

## 3. Which tools in which phase

| Phase | Core Tooling | Guidelines |
|---|---|---|
| P0 Foundations | context7 | protocol-guard |
| P1 Data + API | context7, supabase | protocol-guard |
| P2 Design system | context7, figma | design-constitution |
| P3 Dispatcher dashboard | context7, figma, shadcn, playwright | design-constitution |
| P4 Mobile core | context7, figma | design-constitution |
| P5 Native SMS + outbox | context7 | protocol-guard |
| P6 Witness / crew / hospital / phones | context7, figma, playwright | design-constitution |
| P7 Hardening + E2E | context7, playwright, chrome-devtools | protocol-guard |
| P8 Demo + pitch assets | context7, figma | medical-language, design-constitution |

## 4. Collaborative development workflow for a team of four

1. **One person, one branch (git worktree), one development stream.** Streams: *web*, *mobile*, *shared+data*, *design+pitch*. `git worktree add ../najda-mobile -b feat/mobile`. Merge to `main` only when `pnpm check` is green.
2. **Plan mode first** for anything bigger than a screen: review the architecture and design, then execute.
3. **`DEVELOPMENT.md`** holds the commands and rules every session needs; keep it updated when you learn something new (e.g. "OSRM needs 8 GB RAM").
4. **Focused tasks:** keep tasks well-isolated (e.g. "one task per replay trace", "one per locale file", "one to review the diff for RTL bugs").
5. **Hooks** (included): editing `packages/shared` or `packages/tokens` auto-runs their tests.
6. **Commit often, small.** Commit with meaningful conventional commit messages after each green gate; tag `gate-H10`, `gate-H20` … so you can roll back during the final hours.
7. **Verification loops beat trust:** after UI work, run the app, screenshot, compare, fix. After protocol work: `pnpm check`.
8. **Context hygiene:** reset state between unrelated tasks; don't let one task accumulate unrelated features.

## 5. 20-minute tooling check (do it on day −2)

```bash
node -v                       # 22 or 24
pnpm -v                       # 10.x
corepack enable
npx expo --version            # via npx
java -version                 # JDK 17 for Android builds
adb devices                   # phone appears (USB debugging on)
docker version && supabase --version
python3 --version             # for the cross-check
pnpm install && pnpm check    # everything green before writing a line of app code
```
If `pnpm check` is not green on a clean clone, stop and fix that first.
