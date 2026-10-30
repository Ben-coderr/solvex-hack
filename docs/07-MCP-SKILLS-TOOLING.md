# 07 — MCP servers, Skills and Claude Code setup

> Commands verified against vendor docs on **2026-10-30**. Run `claude mcp list` and `/mcp` after each install; if a command fails, the vendor's docs page is the authority (they change).
> **Rule of thumb:** each connected MCP server adds tool descriptions to the context. Keep ≤ 4 active at a time (see §3).

---

## 1. MCP servers

| # | Server | Why we need it | Install | Auth |
|---|---|---|---|---|
| 1 | **Figma** *(required)* | design ↔ code: read frames, variables, components; write to canvas (remote + Full seat) | plugin (recommended): `claude plugin install figma@claude-plugins-official` then `/plugin` → figma → sign in · or manual: `claude mcp add --transport http figma https://mcp.figma.com/mcp` (add `--scope user` for all projects) then `/mcp` → figma → Authenticate | browser OAuth |
| 2 | **Context7** *(required)* | up-to-date docs for Expo SDK 58, Next 16, Supabase, MapLibre, Reanimated: stops the model coding against stale APIs | `claude mcp add --transport http context7 https://mcp.context7.com/mcp` · then add "use context7" to prompts | none (free tier is rate-limited; optional API key) |
| 3 | **Supabase** | inspect schema, run SQL in dev, read docs, generate types | `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<REF>&read_only=true&features=database,docs"` then `/mcp` → authenticate | browser login to Supabase |
| 4 | **Playwright** | drive the real dashboard and PWA witness page, screenshot at 3 widths, RTL and dark; E2E for the hero flow | `claude mcp add playwright npx @playwright/mcp@latest` | none |
| 5 | **shadcn** | add/search shadcn components with correct APIs | `pnpm dlx shadcn@latest mcp init --client claude` (writes `.mcp.json`), restart Claude Code, `/mcp` | none |
| 6 | Chrome DevTools *(optional)* | performance traces and console/network debugging of the dashboard | `claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest` | none |
| 7 | GitHub *(optional)* | PRs, issues, CI status. The `gh` CLI does the same with less setup and no token in config | prefer `gh auth login` | |

**Deliberately not used**
- **Expo MCP server**: requires a paid EAS plan. We use Context7 + Expo's own markdown docs (`https://docs.expo.dev/llms.txt`) + the Expo skills below.
- Figma *Desktop* server: needs a Dev/Full seat on a paid plan. The remote server covers everything we need.
- Sentry/monitoring MCPs: not needed for a 48 h build.

`.mcp.json` (already in the starter) pre-declares figma, context7, playwright, shadcn and supabase. Claude Code asks you to approve project-scoped servers on first use. **Replace `REPLACE_WITH_PROJECT_REF`** or delete the supabase entry until the project exists.

### 1.1 Safety notes (professional hygiene)
- **Treat tool output as untrusted data.** Database rows (witness text!), web pages and Figma comments can contain prompt-injection. Keep Supabase MCP `read_only=true` and project-scoped, never point it at production data, and never let it run unreviewed writes.
- Never put secrets in `.mcp.json` (it is committed). Use env vars; `.env` is denied to the agent in `.claude/settings.json`.
- Figma OAuth tokens and Supabase login belong to a person: don't share sessions between teammates.

## 2. Skills and plugins

| Skill | What it gives you | Install |
|---|---|---|
| **`frontend-design`** (Anthropic) | pushes toward distinctive typography, layout and motion instead of templated defaults | `/plugin marketplace add anthropics/claude-code` then `/plugin install frontend-design@claude-code-plugins` |
| **Expo skills** | `building-native-ui`, `native-data-fetching`, `expo-tailwind-setup`, `expo-module` (our Kotlin SMS module!), `expo-upgrade`, `expo-cicd-workflows`, … | `npx skills add expo/skills` |
| **Figma skills** (come with the Figma plugin) | `figma-implement-design` (frame → code, 1:1), `figma-use` (canvas writing conventions) | installed by the plugin |
| **Project skills (in this repo)** | `najda-design` (design constitution), `najda-protocol` (don't break the wire format), `najda-medical-language` (wording and claims) | already in `.claude/skills/`: auto-discovered |
| `skill-creator` (optional) | turn a recurring procedure into a skill (e.g. "add a new replay trace") | via the Anthropic skills plugin |

Invoke explicitly when it matters: *"Use the najda-design skill and the frontend-design skill for this screen."*

## 3. Which tools in which phase

| Phase (see `02-PHASE-PROMPTS.md`) | Always on | Add | Skills |
|---|---|---|---|
| P0 Foundations | context7 | — | najda-protocol |
| P1 Data + API | context7 | supabase | najda-protocol |
| P2 Design system | context7 | **figma** | najda-design, frontend-design, figma-use |
| P3 Dispatcher dashboard | context7 | figma, shadcn, playwright | najda-design, frontend-design, figma-implement-design |
| P4 Mobile core | context7 | figma | expo skills, najda-design |
| P5 Native SMS + outbox | context7 | — | `expo-module` |
| P6 Witness / crew / hospital / phones | context7 | figma, playwright | najda-design |
| P7 Hardening + E2E | context7 | **playwright**, chrome-devtools | — |
| P8 Demo + pitch assets | context7 | figma | najda-medical-language, frontend-design |

## 4. Claude Code working method for a team of four

1. **One person, one branch (git worktree), one Claude Code session.** Streams: *web*, *mobile*, *shared+data*, *design+pitch*. `git worktree add ../najda-mobile -b feat/mobile`. Merge to `main` only when `pnpm check` is green.
2. **Plan mode first** for anything bigger than a screen (Shift+Tab to cycle modes): read the plan, then execute.
3. **`CLAUDE.md`** (in the starter) holds the commands and rules every session needs; keep it short. Update it when you learn something (e.g. "OSRM needs 8 GB RAM").
4. **Subagents** for parallel, independent chores: "one subagent per replay trace", "one per locale file", "one to review the diff for RTL bugs". Don't use them for tightly coupled work.
5. **Hooks** (included): editing `packages/shared` or `packages/tokens` auto-runs their tests and returns failures to Claude. Add a second hook for `pnpm typecheck` once the apps exist.
6. **Commit often, small.** Ask Claude to commit with meaningful messages after each green gate; tag `gate-H10`, `gate-H20` … so you can roll back during the final hours.
7. **Verification loops beat trust:** after UI work, make Claude run the app (Playwright MCP / emulator), screenshot, compare, fix. After protocol work: `pnpm check`.
8. **Context hygiene:** `/clear` between unrelated tasks; paste the phase prompt fresh; don't let one session accumulate three features.
9. **Model choice:** use the strongest model for architecture, native module and scoring work; a faster model is fine for locale files, boilerplate and tests.

## 5. 20-minute tooling check (do it on day −2)

```bash
node -v                       # 22 or 24
pnpm -v                       # 10.x
corepack enable
claude --version
claude mcp list               # figma, context7, playwright, shadcn, supabase → Connected
npx expo --version            # via npx
java -version                 # JDK 17 for Android builds
adb devices                   # phone appears (USB debugging on)
docker version && supabase --version
python3 --version             # for the cross-check
pnpm install && pnpm check    # everything green before writing a line of app code
```
If `pnpm check` is not green on a clean clone, stop and fix that first.
