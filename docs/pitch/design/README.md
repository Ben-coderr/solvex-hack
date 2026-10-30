# Design QA — gate-design-1 (2026-10-30)

Produced by `BASE_URL=http://localhost:3000 pnpm --filter web design:qa` (Playwright + axe-core on the installed Chrome) against `/styleguide`.
Matrix: widths 360 / 768 / 1366 / 1440 × (light + en/LTR, dark + ar/RTL) page chrome; every section also renders its own light/dark × en-ltr/ar-rtl panels. Plus 200% text (360, 1440), reduced motion, axe WCAG 2.1 A/AA, greyscale and squint captures.

| Run | Defects | What it found → fix |
|---|---|---|
| 1 | 163 | 120× styleguide nav links 30 px · 10× LocaleSwitch / copy-packet 40 px → 48 px · 9× PreAlertCard header overflow at 360 → wraps · axe `label-content-name-mismatch` on SosButton → accessible name = visible words · 23× overflow at 200% text |
| 2 | 15 | 200% text only: `min-w-48` (rem) doubled · non-wrapping pills/headers · nowrap shadcn button · skeleton rem widths |
| 3–5 | 7 → 5 → 1 | grid items `min-w-0`; `overflow-wrap:anywhere` on cards, ReasonList and styleguide chrome |
| 6 | **0** | — |

Critique (docs/06 §8.1 #4) top-5 applied: confidence pill shown once on PreAlertCard · HospitalCard explains the ranking rule and missing capabilities · larger R letter in the triangle · mechanism localised from reason codes · dev badge removed from screenshots. Also: Arabic list separator via `Intl.ListFormat`.

Not covered here (honest gaps): mobile components were not visually verified on a device (P4); offline drill applies to app screens (P3/P7); projector test at 5 m is a human check (1366 screenshots provided).

Files: `styleguide-<width>-<theme>-<locale>.jpg` (full page), `section-*.png` (critique input), `greyscale-TriageMarker.png`, `squint-IncidentRow.png`, `text200-360-ar.jpg`, `qa-report.json` (last run).
