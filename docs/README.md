# Sellekni docs

Start with the [root README](../README.md) (overview with pictures), [RUNNING.md](RUNNING.md) (run and test it locally) and [`DEVELOPMENT.md`](../DEVELOPMENT.md) (rules and architecture). Decisions taken while building are logged in `DECISIONS.md`.
Numbers 01–02 were planning prompts and are not in the repo.

| Doc | Read it when |
|---|---|
| [03 Product spec](03-PRODUCT-SPEC.md) | you need the scope, users and the hero flow |
| [04 Architecture and stack](04-ARCHITECTURE-AND-STACK.md) | you touch the server, the database or the app wiring |
| [05 Protocol, scoring, ranking, merge](05-PROTOCOL-SCORING-RANKING.md) | **the contract**: change it only through [guidelines/protocol-guard.md](guidelines/protocol-guard.md) |
| [06 Design and UX](06-DESIGN-AND-UX.md) · [addendum](06-addendum.md) | you build a screen |
| [07 MCP, skills and tooling](07-MCP-SKILLS-TOOLING.md) | you set up the dev tools (`.mcp.json`) |
| [08 Free deployment](08-FREE-DEPLOYMENT.md) | you deploy, or plan the offline stage fallback |
| [09 48 h plan and team](09-PLAN-48H-AND-TEAM.md) · [17 24 h plan](17-24H-PLAN.md) | you plan the next phase |
| [10 Pitch, demo, Q&A](10-PITCH-DEMO-QA.md) · [15 Jury alignment](15-JURY-ALIGNMENT-AND-EVIDENCE.md) | you prepare the pitch |
| [11 Corrections and risks](11-CORRECTIONS-AND-RISKS.md) | before quoting any number |
| [12 Rebrand, OBD, IoT decisions](12-DECISIONS-REBRAND-OBD-IOT.md) · [16 OBD and box roadmap](16-ROADMAP-OBD-AND-BOX-REFERENCE.md) | hardware questions |
| [13 Phone sensing plan](13-PHONE-SENSING-PLAN.md) | you touch the crash detector (`packages/detector`) |
| [14 Business model canvas](14-BUSINESS-MODEL-CANVAS.md) | business questions |

Guidelines: [design constitution](guidelines/design-constitution.md), [medical language](guidelines/medical-language.md), [protocol guard](guidelines/protocol-guard.md).
## Folders

| Folder | What |
|---|---|
| [`diagrams/`](diagrams/) | Reference SVGs (built by `build_diagrams.py`) and the one-page blueprint `sellekni-blueprint.html` |
| [`diagrams/pitch/`](diagrams/pitch/) | Slide diagrams (architecture, detection gates, packet, orientation, today vs Sellekni, hardware tiers / OBD / box). Run `python3 gen.py` and `python3 hw.py` in that folder to regenerate them |
| [`assets/`](assets/) | Images used by the READMEs: logo, screenshots, diagram renders |
| [`guidelines/`](guidelines/) | Design constitution, medical language, protocol guard |
| [`field-notes/`](field-notes/) | Drills and measurements (offline drill, performance, reset runs, G4 drill protocol) |
| [`pitch/`](pitch/) | Deck material, BMC (HTML + PDF), runbook, Q&A sheet, rehearsal log, videos, screenshot sets (`design/`, `screens/`) |
| [`security-review-p7.md`](security-review-p7.md) | Security review |
