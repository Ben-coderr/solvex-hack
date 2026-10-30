#!/usr/bin/env python3
"""Builds docs/diagrams/sellekni-blueprint.html: one self-contained page that carries the seven diagrams
(inline SVG, theme variables) plus the tables the team needs when presenting.
    cd docs/diagrams && python3 build_diagrams.py && python3 build_page.py
Numbers on the page come from `pnpm --filter @najda/detector report` and `pnpm check` (see docs/13 section 4)."""
import pathlib, html, re

HERE = pathlib.Path(__file__).parent
svg = {p.name[:2]: p.read_text() for p in sorted((HERE / 'inline').glob('*.svg'))}
for k in ('01', '02', '03', '04', '05', '06', '07'):
    assert k in svg, f'missing inline diagram {k}'

PAGE = r'''<title>Sellekni Blueprint</title>
<meta name="viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
/* Layout concept: a working blueprint. One column, a sticky section index, every diagram on its own drafting panel,
   tables for what the team has to check. Tokens are the team's own (packages/tokens/tokens.json). */
:root {
  --bg: #F6F4EF; --surface: #FFFFFF; --raised: #FBFAF7; --line: #D9D3C5;
  --text: #14181C; --muted: #566270; --brand: #2B62F0; --brand-text: #1740B0; --brand-soft: #E2E8F6;
  --ok: #1F7A50; --warn-bg: #FFF4CF; --warn-line: #D9B13A; --warn-text: #5C4500;
  --dg-ink: #14181C; --dg-muted: #566270; --dg-line: #B9B3A4; --dg-surface: #FFFFFF; --dg-paper: #FBFAF7;
  --dg-brand: #2B62F0; --dg-brand-text: #1740B0; --dg-brand-soft: #E2E8F6;
  --f-display: 'Bricolage Grotesque', 'IBM Plex Sans', system-ui, sans-serif;
  --f-body: 'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --f-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0E1114; --surface: #151A1F; --raised: #1D242B; --line: #2B343D;
    --text: #ECEFF2; --muted: #9AA6B2; --brand: #4B7BF5; --brand-text: #9DB8FF; --brand-soft: #1B2A4A;
    --ok: #4CC38A; --warn-bg: #2E2608; --warn-line: #8A6D14; --warn-text: #F2D675;
    --dg-ink: #ECEFF2; --dg-muted: #9AA6B2; --dg-line: #3A444E; --dg-surface: #1D242B; --dg-paper: #151A1F;
    --dg-brand: #4B7BF5; --dg-brand-text: #9DB8FF; --dg-brand-soft: #24355B;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0E1114; --surface: #151A1F; --raised: #1D242B; --line: #2B343D;
  --text: #ECEFF2; --muted: #9AA6B2; --brand: #4B7BF5; --brand-text: #9DB8FF; --brand-soft: #1B2A4A;
  --ok: #4CC38A; --warn-bg: #2E2608; --warn-line: #8A6D14; --warn-text: #F2D675;
  --dg-ink: #ECEFF2; --dg-muted: #9AA6B2; --dg-line: #3A444E; --dg-surface: #1D242B; --dg-paper: #151A1F;
  --dg-brand: #4B7BF5; --dg-brand-text: #9DB8FF; --dg-brand-soft: #24355B;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  background: var(--bg); color: var(--text); font-family: var(--f-body); font-size: 16px; line-height: 1.55;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 0 56px; -webkit-text-size-adjust: 100%;
}
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); background: var(--bg); z-index: 20; }
.wrap { max-width: 1120px; margin-inline: auto; }
a { color: var(--brand-text); text-underline-offset: 2px; }
a:focus-visible, button:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; border-radius: 4px; }
code, .mono { font-family: var(--f-mono); font-size: .92em; }
h1, h2, h3 { font-family: var(--f-display); text-wrap: balance; line-height: 1.12; margin: 0; letter-spacing: -.01em; }
p { margin: 0; }
.muted { color: var(--muted); }
.label { font-size: 12px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }

/* masthead */
.mast { padding-block: 40px 22px; display: grid; gap: 14px; }
.brandline { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 22px; }
.brandline h1 { font-size: clamp(2.6rem, 8vw, 4.6rem); font-weight: 700; }
.ar { font-family: 'IBM Plex Sans Arabic', var(--f-body); font-size: clamp(2rem, 6vw, 3.2rem); font-weight: 600; color: var(--brand-text); }
.lede { max-width: 62ch; font-size: 1.12rem; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 500; }
.chip b { font-weight: 600; }
.chip.main { background: var(--brand-soft); border-color: var(--brand); color: var(--brand-text); }
.chip.road { border-style: dashed; color: var(--muted); }
.checks { font-size: 14px; color: var(--muted); max-width: 86ch; }
.checks b { color: var(--ok); font-weight: 600; }
.notice { border: 1px solid var(--warn-line); background: var(--warn-bg); color: var(--warn-text); border-radius: 10px; padding: 12px 16px; font-size: 14px; max-width: 86ch; }
.notice b { font-weight: 600; }

/* section index */
.index { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 15; background: var(--bg); border-block: 1px solid var(--line); margin-block: 18px 8px; }
.index ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 2px; overflow-x: auto; scrollbar-width: thin; }
.index a { display: block; padding: 11px 12px; font-size: 14px; font-weight: 500; color: var(--text); text-decoration: none; white-space: nowrap; border-bottom: 2px solid transparent; }
.index a:hover { border-bottom-color: var(--brand); color: var(--brand-text); }

section { padding-block: 44px 8px; scroll-margin-top: 64px; display: grid; gap: 18px; }
.sechead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
.sechead h2 { font-size: clamp(1.6rem, 4vw, 2.2rem); font-weight: 700; }
.ref { font-family: var(--f-mono); font-size: 12.5px; color: var(--muted); border: 1px solid var(--line); border-radius: 6px; padding: 1px 7px; }
.intro { max-width: 70ch; }

/* figures */
figure { margin: 0; display: grid; gap: 8px; }
.fig { background: var(--dg-paper); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; padding: 10px; }
.fig .inner { min-width: 880px; }
figcaption { font-size: 14px; color: var(--muted); max-width: 86ch; }
figcaption b { color: var(--text); font-weight: 600; }
.hint { display: none; font-size: 12px; color: var(--muted); }
@media (max-width: 920px) { .hint { display: block; } }

/* tables */
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
th, td { text-align: left; vertical-align: top; padding: 10px 14px; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: 0; }
thead th { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; background: var(--raised); position: sticky; top: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.said { font-weight: 500; min-width: 200px; }
.pass { color: var(--ok); font-weight: 600; }
.zero { font-weight: 600; }
.sub { display: block; font-size: 12.5px; color: var(--muted); font-weight: 400; }
tr.crash td { background: var(--brand-soft); }
.tag { font-family: var(--f-mono); font-size: 11.5px; border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; color: var(--muted); white-space: nowrap; }
.dots { display: inline-flex; gap: 3px; vertical-align: middle; margin-right: 8px; }
.dots i { width: 10px; height: 10px; border-radius: 2px; border: 1.5px solid var(--muted); display: block; }
.dots i.now { background: var(--text); border-color: var(--text); }
.dots i.gain { background: var(--brand); border-color: var(--brand); }

/* code */
.codebox { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.codebox code { font-size: 14px; overflow-wrap: anywhere; flex: 1 1 320px; }
button.copy { font: inherit; font-size: 13px; font-weight: 600; background: var(--brand-soft); color: var(--brand-text); border: 1px solid var(--brand); border-radius: 8px; padding: 6px 12px; cursor: pointer; min-height: 36px; }
button.copy:hover { background: var(--brand); color: #fff; }

/* lists and grids */
.cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: grid; gap: 8px; align-content: start; min-width: 0; }
.card h3 { font-size: 1.1rem; }
.card ul, ol.plain { margin: 0; padding-left: 1.1em; display: grid; gap: 6px; }
.tests { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); margin: 0; padding: 0; list-style: none; }
.tests li { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 14px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: baseline; }
.tests .tag { grid-row: span 2; }
.stages { display: grid; gap: 0; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--surface); }
.stage { padding: 14px 16px; border-right: 1px solid var(--line); display: grid; gap: 4px; align-content: start; }
.stage:last-child { border-right: 0; }
.stage.now { background: var(--brand-soft); }
.stage h3 { font-size: 1.05rem; }
.stage .status { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.stage.now .status { color: var(--brand-text); }
.stage p { font-size: 14px; }
.ask { counter-reset: q; list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.ask li { counter-increment: q; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px 12px 52px; position: relative; }
.ask li::before { content: counter(q); position: absolute; left: 14px; top: 11px; width: 26px; height: 26px; border-radius: 50%; background: var(--brand); color: #fff; font-weight: 600; font-size: 13px; display: grid; place-items: center; }
.ask b { font-weight: 600; }
/* phone: prose tables become stacked cards instead of squeezed columns */
@media (max-width: 720px) {
  table.stack, table.stack tbody, table.stack tr, table.stack td { display: block; width: 100%; }
  table.stack thead { display: none; }
  table.stack tr { padding: 12px 14px; border-bottom: 1px solid var(--line); }
  table.stack tr:last-child { border-bottom: 0; }
  table.stack td { padding: 2px 0; border: 0; }
  table.stack td.said { min-width: 0; font-size: 15.5px; }
  table.stack td[data-l]::before { content: attr(data-l); display: block; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-top: 8px; }
}
footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--muted); display: grid; gap: 6px; max-width: 86ch; }
</style>

<div class="wrap">
<header class="mast">
  <div class="brandline"><h1>Sellekni</h1><span class="ar" lang="ar" dir="rtl">سلّكني</span></div>
  <p class="lede">Blueprint for SolveX 3.0, Problem 1: road-accident response in Algeria. A phone detects the crash, sends one short structured message, and the operations room sees where it happened, how bad it probably is, and which hospital fits.</p>
  <div class="chips">
    <span class="chip main"><b>Main path</b> · phone sensors</span>
    <span class="chip road"><b>Roadmap</b> · OBD link</span>
    <span class="chip road"><b>Roadmap</b> · plug-in box</span>
    <span class="chip">Wire magic <span class="mono">SLK1</span></span>
    <span class="chip">Codename NAJDA stays in code</span>
  </div>
  <p class="checks"><b>pnpm check is green</b> on this pack: 67 protocol tests, 10 design-token tests, 21 detector tests, and an independent Python decoder that agrees on 302 valid packets and refuses all 134 invalid ones. Everything the detector shows below is a synthetic replay, labelled as such.</p>
  <p class="notice"><b>Not read:</b> the two GitHub repositories (<span class="mono">obd-connected-pack</span> and <span class="mono">najda/docs/solvex</span>). Access failed from my side, so this page rests on the old plan files you uploaded and on sources I checked. How to give access is in docs/12 §7.</p>
</header>

<nav class="index" aria-label="Sections"><ul>
  <li><a href="#plan">24 hours</a></li><li><a href="#decisions">Decisions</a></li><li><a href="#system">System</a></li><li><a href="#demo">Demo flow</a></li>
  <li><a href="#sensing">Phone sensing</a></li><li><a href="#packet">One packet</a></li><li><a href="#model">Business model</a></li>
  <li><a href="#jury">Jury map</a></li><li><a href="#roadmap">Roadmap</a></li><li><a href="#open">Open questions</a></li>
</ul></nav>

<section id="plan">
  <div class="sechead"><h2>The next 24 hours</h2><span class="ref">docs/17</span></div>
  <p class="intro">The goal is one rehearsed 90-second flow on real hardware and an honest five-minute pitch. The clock below assumes the start is Friday 18:00 and the end is Saturday 18:00; shift it if your pitch slot is earlier.</p>
  <div class="cols">
    <div class="card">
      <h3>Cut now, do instead</h3>
      <ul>
        <li>Crew page and hospital-registry admin: <b>none</b>.</li>
        <li>Native silent-SMS module: the <b>SMS composer</b> with the packet pre-filled, one tap to send. It is still a real SMS.</li>
        <li>Background Drive mode: <b>foreground screen with keep-awake</b>. Android 14 wants a declared service type and screen-off behaviour is unmeasured.</li>
        <li>OSRM, PMTiles: <b>haversine × 1.4</b> labelled “estimated”, online tiles, a screenshot as map fallback.</li>
        <li>Full three-language UI: <b>French and English complete</b>; Arabic for the splash, the name and the countdown screen.</li>
        <li>In-app witness mode: a <b>witness web page</b>, which also gives the second device for the merge moment.</li>
        <li>Sensor Lab: only <b>T1 and T3</b> on the Realme.</li>
        <li>Figma first: build from the tokens and use this page as the visual reference.</li>
      </ul>
    </div>
    <div class="card">
      <h3>Keep, whatever happens</h3>
      <ul>
        <li>Replay on the Realme, countdown, alert, packet over HTTPS, pin with band, score and reasons.</li>
        <li>Mobile data off, the same packet by SMS through the gateway phone.</li>
        <li>Witness on a second device, merge, higher confidence.</li>
        <li>Acknowledge, hospital ranking, pre-alert, hospital ACK, “received” on the driver’s phone.</li>
        <li>The false-alarm moment: <span class="mono">pothole_then_stop</span> and <span class="mono">phone_drop</span> replays do nothing.</li>
        <li>The packet on the projector, the REPLAY and DEMO labels, the audit log.</li>
      </ul>
    </div>
  </div>
  <div class="scroll"><table class="stack">
    <thead><tr><th>Block</th><th>A Mobile</th><th>B Web and API</th><th>C Shared, data, gateway</th><th>D Design, pitch</th><th>Gate</th></tr></thead>
    <tbody>
      <tr><td class="said">H0–H1<span class="sub">18:00</span></td><td>Realme set-up, T1, T3</td><td>Next app, Supabase local</td><td>Gateway phone; check the real webhook payload</td><td>Slide skeleton, brand constants</td><td><b>G0:</b> pnpm check green on every laptop</td></tr>
      <tr><td class="said">H1–H5</td><td>Detector adapter, replay screen, countdown, packet, HTTPS POST</td><td>Migrations, incident and SMS endpoints, ingest</td><td>Illustrative hospitals, ranking with haversine ETA, webhook fixtures</td><td>Countdown, dashboard and detail screens from the tokens; slides v0</td><td><b>G1:</b> two canonical SMS give two incidents; a bad CRC is stored raw and shown</td></tr>
      <tr><td class="said">H5–H8</td><td>Keep going</td><td>Keep going</td><td><b>Sleep, 3 h</b></td><td><b>Sleep, 3 h</b></td><td>Sleep right after a gate that passed</td></tr>
      <tr><td class="said">H8–H10</td><td>Drive screen, SOS, status screen, composer SMS</td><td>Dashboard map, queue, detail, lifecycle; witness page</td><td>Pre-alert card, hospital ACK page</td><td>Polish both UIs, packet as UI, slides v1</td><td><b>G2 and G3:</b> an outsider runs the flow in under 90 s; the Realme replay reaches the dashboard over HTTPS</td></tr>
      <tr><td class="said">H10–H13</td><td><b>Sleep, 3 h</b></td><td><b>Sleep, 3 h</b></td><td>Merge display, audit view, hospital view</td><td>BMC, roadmap and sources slides; first backup videos</td><td>Someone from A and B is always awake</td></tr>
      <tr><td class="said">H13–H15</td><td>Data-off drill, SIM choice</td><td>Pre-alert SMS through the gateway, demo reset</td><td>Latency measured 10 times per channel</td><td>Hallway tests</td><td><b>G4:</b> airplane mode, SMS only, still reaches the dashboard, screen-recorded</td></tr>
      <tr><td class="said">H15–H18</td><td>All states, permission and battery drill</td><td>Backup deploy only if all is green</td><td>Gate-table slide, Q&amp;A sheet</td><td>Slides v2, demo script, a backup video of every step</td><td><b>Freeze:</b> tag demo-v1, APK hash, videos recorded</td></tr>
      <tr><td class="said">H18–H22</td><td>Rehearse three times on the stage hardware</td><td>Same</td><td>Same</td><td>One idea per slide, Q&amp;A drill</td><td><b>H20:</b> dress rehearsal</td></tr>
      <tr><td class="said">H22–H24</td><td>Charge everything, spare phone, hotspot</td><td>Freeze the database snapshot</td><td>Print the Q&amp;A and sources</td><td>Final run</td><td><b>Pitch</b></td></tr>
    </tbody>
  </table></div>
  <p class="notice"><b>If a gate is missed:</b> real SMS fails, use the labelled Simulate SMS button. The replay fails on the phone, run it inside the dashboard demo page. The dashboard fails, show the recorded video of that step. Say out loud what is simulated.</p>
  <div class="cols">
    <div class="card">
      <h3>Android 14 on the Realme</h3>
      <ul>
        <li>Confirmed by you: Android 14, the Realme UI 5.0 generation.</li>
        <li>Background services need a declared type, so we avoid them.</li>
        <li>Sideloaded apps may block the SMS permission under “restricted settings”.</li>
        <li><b>Unverified:</b> whether the countdown takes over a locked screen. Demo with the screen on.</li>
      </ul>
    </div>
    <div class="card">
      <h3>The pitch without interviews</h3>
      <ul>
        <li>Say once: operators and emergency departments are not yet interviewed, and that is the first step after the event.</li>
        <li>Run three or four hallway tests with other participants and any health or emergency mentor, labelled as such.</li>
        <li>Show the iteration table with the real changes, and the canvas as hypotheses with their next experiments.</li>
      </ul>
    </div>
  </div>
</section>

<section id="decisions">
  <div class="sechead"><h2>What you decided, and what changed</h2><span class="ref">docs/12 · 13 · 14 · 15 · 16</span></div>
  <div class="scroll"><table class="stack">
    <thead><tr><th>You said</th><th>What I did</th></tr></thead>
    <tbody>
      <tr><td class="said">24 hours left, Android 14, nobody to interview.</td><td>Re-planned the build with hour blocks, a cut list and sleep shifts (the next 24 hours, above). The Realme facts are updated, and the Design Thinking evidence now uses hallway tests at the hackathon instead of interviews.</td></tr>
      <tr><td class="said">Phone sensors are the main path. ESP32 and OBD are secondary.</td><td>The detector was built phone-first and made range-aware (docs/13). OBD and the box are now a roadmap with drawings and a reference design (docs/16). The only box item in the 48 hours is a simulated ±200 g replay.</td></tr>
      <tr><td class="said">Sellekni means “help me” in Algerian Darija.</td><td>Product name is Sellekni (سلّكني). NAJDA stays as the internal codename in packages, headers and file names. Please have a native speaker confirm the Arabic spelling, and check the name against INAPI and domains.</td></tr>
      <tr><td class="said">I’ll do what you recommend.</td><td>The wire magic changed from <span class="mono">NAJDA1</span> to <span class="mono">SLK1</span> with a script. The CRC covers the magic, so every golden vector was regenerated and the independent Python decoder re-checked all of them.</td></tr>
      <tr><td class="said">We can use the mono logo.</td><td>The product UI uses the single-colour logo. The red version is kept for the splash screen, store icon and pitch only, because it is too close to the triage red. Tests enforce both rules.</td></tr>
      <tr><td class="said">Search more and more.</td><td>New research on phone accelerometer limits, GPS lag, Android sensor rules, OBD facts, Algerian road-safety and startup context. Claims I could not source were removed, including the old plan’s numbers.</td></tr>
      <tr><td class="said">We will build the schema with drawings.</td><td>Seven diagrams, all on this page and in <span class="mono">docs/diagrams</span> as standalone SVG files.</td></tr>
      <tr><td class="said">I have a Realme 10 Pro+.</td><td>A field guide and a ten-test plan for that phone (below). The accelerometer range and sampling rate are unknown until test T1 and T3 are run on it.</td></tr>
      <tr><td class="said">They focus on the BMC and the jury criteria.</td><td>A Business Model Canvas with every payer and price marked as a hypothesis, and a map from each criterion to the evidence we have and the gap (docs/14, docs/15).</td></tr>
    </tbody>
  </table></div>
</section>

<section id="system">
  <div class="sechead"><h2>How the pieces fit</h2><span class="ref">docs/04</span></div>
  <figure>
    <div class="fig"><div class="inner">@@01@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>Three ways in, one decoder.</b> The driver’s phone, a witness and a manual SOS reach the same server by HTTPS or SMS. The server recomputes severity, merges duplicates and ranks hospitals, and people decide at every step. The voice call to 14, 1021, 1055 or 17 always stays.</figcaption>
  </figure>
</section>

<section id="demo">
  <div class="sechead"><h2>The 90-second demo</h2><span class="ref">docs/10 §3</span></div>
  <figure>
    <div class="fig"><div class="inner">@@02@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>Twelve messages from impact to a ready hospital.</b> The driver side runs from a labelled synthetic replay with mobile data off, so the SMS path is what the jury sees. If the real SMS fails on stage, the ladder is Simulate SMS, then replay, then the recorded video.</figcaption>
  </figure>
</section>

<section id="sensing">
  <div class="sechead"><h2>Phone sensing</h2><span class="ref">docs/13</span></div>
  <p class="intro">A phone accelerometer usually tops out between ±8 g and ±16 g. A full frontal test at 56 km/h produces 36 to 46 g for about 100 ms (Locey et al., 2012). So the phone cannot report how hard the crash was. It can report how long the sensor stayed pinned at its ceiling, and GPS can report the speed collapse. The Realme’s own range is measured in test T1.</p>
  <figure>
    <div class="fig"><div class="inner">@@07@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>One crash, three views.</b> Time at the ceiling replaces amplitude as the severity signal. A pothole never reaches either ceiling.</figcaption>
  </figure>
  <figure>
    <div class="fig"><div class="inner">@@03@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>Four gates, each tested by switching it off.</b> When a gate is removed, the trap it guards starts alerting, so none of them is decoration. A 12 km/h shunt is not detected, by design; witness mode and manual SOS cover it.</figcaption>
  </figure>

  <h3>What the reference detector does with the synthetic scenarios</h3>
  <div class="scroll"><table>
    <thead><tr><th>Scenario</th><th>Should</th><th class="num">±8 g sensor</th><th class="num">±16 g sensor</th><th class="num">±32 g sensor</th></tr></thead>
    <tbody>
      <tr class="crash"><td><span class="mono">frontal_45</span><span class="sub">Δv 45 km/h, 32 g peak</span></td><td>alert</td><td class="num"><span class="pass">60/60</span><span class="sub">53 ms at ceiling</span></td><td class="num"><span class="pass">60/60</span><span class="sub">41 ms at ceiling</span></td><td class="num"><span class="pass">60/60</span><span class="sub">8 ms at ceiling</span></td></tr>
      <tr class="crash"><td><span class="mono">rollover_71</span><span class="sub">trip at 20 g, about 360° roll, slide</span></td><td>alert</td><td class="num"><span class="pass">60/60</span><span class="sub">64 ms at ceiling</span></td><td class="num"><span class="pass">60/60</span><span class="sub">23 ms at ceiling</span></td><td class="num"><span class="pass">60/60</span><span class="sub">0 ms at ceiling</span></td></tr>
      <tr><td><span class="mono">speed_bump</span><span class="sub">brake 50 to 25, bump 6 g for 60 ms</span></td><td>no alert</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
      <tr><td><span class="mono">hard_brake</span><span class="sub">90 to 0 at 0.8 g</span></td><td>no alert</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
      <tr><td><span class="mono">phone_drop</span><span class="sub">free fall, clipped impacts, car keeps going</span></td><td>no alert</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
      <tr><td><span class="mono">pothole_80</span><span class="sub">6 g for 20 ms</span></td><td>no alert</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
      <tr><td><span class="mono">pothole_then_stop</span><span class="sub">pothole, then braking to a red light</span></td><td>no alert</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
      <tr><td><span class="mono">door_slam</span> · <span class="mono">walking_pocket</span><span class="sub">never armed: not driving</span></td><td>no alert</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
      <tr><td><span class="mono">fender_bender_12</span><span class="sub">12 km/h shunt</span></td><td>not detected, by design</td><td class="num zero">0/60</td><td class="num zero">0/60</td><td class="num zero">0/60</td></tr>
    </tbody>
  </table></div>
  <p class="muted" style="font-size:14px;max-width:86ch">Each cell is 3 phone mounts × 20 random seeds. A ±4 g sensor is refused (SOS and witness only). <b>REPLAY · SYNTHETIC.</b> These are logic tests on traces I generated, not a detection rate, and none of it has met a real road yet. Do not quote a rate on stage.</p>

  <h3>Realme 10 Pro+ field plan</h3>
  <div class="cols">
    <div class="card">
      <h3>Known from the spec sheet</h3>
      <ul>
        <li>Launched with Android 13 and Realme UI 4.0. Yours runs Android 14, the Realme UI 5.0 generation (you confirmed it).</li>
        <li>Accelerometer and gyroscope; no barometer.</li>
        <li>Dual nano-SIM, so choose which SIM sends the SMS.</li>
        <li>Realme’s battery management can stop background apps. Sellekni needs auto-launch, foreground and background activity allowed; menu names vary by version.</li>
        <li>A sideloaded app may have “restricted settings” on SMS; onboarding must detect it and guide the user.</li>
      </ul>
    </div>
    <div class="card">
      <h3>Unknown until measured</h3>
      <ul>
        <li>The accelerometer’s maximum range and resolution (T1).</li>
        <li>The real sampling rate; the detector needs at least 45 Hz (T3).</li>
        <li>GPS speed lag; the confirm window assumes about 0.8 s (T5).</li>
        <li>Whether sensors keep streaming with the screen off (T6).</li>
      </ul>
    </div>
  </div>
  <ul class="tests">
    <li><span class="tag">T1</span><b>Inventory</b><span class="muted">range, resolution, minimum delay</span></li>
    <li><span class="tag">T2</span><b>Rest noise</b><span class="muted">flat for 60 s, noise below 0.5 g</span></li>
    <li><span class="tag">T3</span><b>Real sampling rate</b><span class="muted">request 50, 100, 200 Hz; median at least 50 Hz</span></li>
    <li><span class="tag">T4</span><b>Saturation probe</b><span class="muted">padded drops, find the true ceiling</span></li>
    <li><span class="tag">T5</span><b>GPS speed lag</b><span class="muted">constant speed, then one controlled brake</span></li>
    <li><span class="tag">T6</span><b>Screen-off survival</b><span class="muted">30 min, no gap longer than 1 s</span></li>
    <li><span class="tag">T7</span><b>Battery cost</b><span class="muted">60 min, screen dimmed vs foreground service</span></li>
    <li><span class="tag">T8</span><b>Hard negatives</b><span class="muted">bumps, braking, door slam, 5 times each, 0 alerts</span></li>
    <li><span class="tag">T9</span><b>Permission drill</b><span class="muted">a teammate installs it unaided</span></li>
    <li><span class="tag">T10</span><b>Airplane-mode drill</b><span class="muted">data off, SMS reaches the gateway</span></li>
  </ul>
  <p class="muted" style="font-size:14px;max-width:86ch">Never stage a crash. Real-road tests are negatives and low-speed manoeuvres in a closed, legal area with a passenger holding the phone.</p>
</section>

<section id="packet">
  <div class="sechead"><h2>One packet, any source</h2><span class="ref">docs/05 · docs/16</span></div>
  <figure>
    <div class="fig"><div class="inner">@@04@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>The packet below is real output</b> of the detector, then <span class="mono">toPacketHints</span>, then <span class="mono">encodeDzmsd</span>: 77 characters, pure GSM-7, CRC-8 at the end. A plug-in box or an OBD link would fill the same fields, so the server never changes.</figcaption>
  </figure>
  <div class="codebox"><code id="wire">SLK1 K7Q2M Y44L 36.47213,2.82871 T1432 SA V1 P1 KC D45 G16 FN 8F84FRCH+VF #E9</code><button class="copy" type="button" id="copy">Copy packet</button></div>
</section>

<section id="model">
  <div class="sechead"><h2>Business Model Canvas</h2><span class="ref">docs/14</span></div>
  <p class="intro">The old plan had prices and a per-incident cost with no source and no interview behind them. None of them are used. Who pays is a hypothesis with a test next to it.</p>
  <figure>
    <div class="fig"><div class="inner">@@06@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>Free for senders and, in the pilot, for receivers.</b> Money, if any, comes from non-dilutive funding first, then institutional licences, fleets or insurers, and anonymised black-spot analytics. No price is claimed.</figcaption>
  </figure>
  <h3>Facts that are safe to say, with their source</h3>
  <div class="scroll"><table class="stack">
    <thead><tr><th>Fact</th><th>Source</th></tr></thead>
    <tbody>
      <tr><td>Algeria in 2025: 26,976 road accidents, 3,838 deaths and 37,020 injured, up 2.68%, 2.62% and 4.9% on 2024.</td><td><a href="https://atlas-mag.net/fr/articles/hausse-des-accidents-sur-les-routes-algeriennes-en-2025">Atlas Magazine, 24 Feb 2026</a>, quoting the DNSR</td></tr>
      <tr><td>The DNSR attributes more than 96% of accidents to the human factor.</td><td>same article</td></tr>
      <tr><td>Motor insurance was about 41.6% of roughly 172 bn DZD in premiums in 2024.</td><td><a href="https://atlas-mag.net/fr/articles/clone-marche-algerien-de-lassurance-en-2024-chiffre-daffaires-par-branche">Atlas Magazine</a>, Treasury data</td></tr>
      <tr><td>The startup label, the “projet innovant” label and access to the Algeria Startup Fund exist.</td><td><a href="https://www.upgrowth.dz/questions/label-startup-projet-innovant-algerie">UpGrowth summary</a> (read the decrees before filing)</td></tr>
      <tr><td>Algeria plans to switch off 2G and 3G by 2029, which is why the box would use LTE.</td><td><a href="https://algerie-eco.com/2026/04/09/algerie-la-desactivation-des-reseaux-2g-et-3g-prevue-en-2029/">Algérie Eco, 9 Apr 2026</a></td></tr>
    </tbody>
  </table></div>
  <p class="notice"><b>Do not say:</b> “18 minutes to dispatch”, “72% 4G”, “95% SMS coverage”, “under 30% of ambulances have GPS”, “5 DZD per incident”, “no equivalent app in Algeria”, or any “lives saved”. None had a source. Ask Protection civile, SAMU or the operators in writing if you want one of them.</p>
</section>

<section id="jury">
  <div class="sechead"><h2>Jury map</h2><span class="ref">docs/15</span></div>
  <p class="notice"><b>The criteria are not confirmed.</b> I found two assumed lists in the old files and used their union. Please send the official brief and weights; this table re-weights in ten minutes. Scores are my estimate, not the jury’s.</p>
  <div class="scroll"><table class="stack">
    <thead><tr><th>Criterion</th><th>What we can claim</th><th>Next action</th><th>Score now → after</th></tr></thead>
    <tbody>
      <tr><td class="said">Innovation</td><td>A data layer that works when data is weak, explains its severity estimate, and knows phone sensors saturate.</td><td>Tell the saturation story with the drawing above.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i class="now"></i><i></i></span>4 → 4</td></tr>
      <tr><td class="said">Social impact</td><td>3,838 deaths in 2025 (DNSR). Impact metrics are a pilot plan, not a result.</td><td>The sourced hook. An operator interview after the event.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i class="gain"></i><i></i></span>3 → 4</td></tr>
      <tr><td class="said">Technical feasibility</td><td>Tested protocol, independent decoder, a detector that rejects the traps that fool simple ones.</td><td>2–3 real phone traces and one real SMS run.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i class="now"></i><i class="gain"></i></span>4 → 5</td></tr>
      <tr><td class="said">Business viability</td><td>Payer candidates and a verified label route; prices not claimed.</td><td>For the pitch, the canvas experiments as next steps. Interviews after the event.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="gain"></i><i></i><i></i></span>2 → 3</td></tr>
      <tr><td class="said">Design Thinking</td><td>Problem chain, point of view, how-might-we questions, four prototype fidelities.</td><td>Hallway tests at the hackathon, a test log, an iteration table. Operator interviews come after the event.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="gain"></i><i class="gain"></i><i></i></span>2 → 4</td></tr>
      <tr><td class="said">Scalability</td><td>Stateless scoring, a versioned protocol, a v1.1 path for new sources.</td><td>One roadmap slide with no dates we cannot defend.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i></i><i></i></span>3 → 3</td></tr>
      <tr><td class="said">Originality</td><td>Phone detection, SMS fallback and an operations-room view with a hospital recommendation together.</td><td>Install and try each competing app, then fill the table.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i class="gain"></i><i></i></span>3 → 4</td></tr>
      <tr><td class="said">Demo quality</td><td>A 90-second flow with a four-step fallback ladder.</td><td>Rehearse three times with a timer.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i class="now"></i><i class="gain"></i></span>4 → 5</td></tr>
      <tr><td class="said">Pitch</td><td>Problem, solution, demo, model, ask in five minutes.</td><td>One idea per slide.</td><td><span class="dots" aria-hidden="true"><i class="now"></i><i class="now"></i><i class="now"></i><i class="gain"></i><i></i></span>3 → 4</td></tr>
    </tbody>
  </table></div>
  <div class="card">
    <h3>Design Thinking evidence, nothing invented</h3>
    <ul>
      <li><b>Empathize:</b> five 15-minute conversations: a driver, an operator or volunteer, an ED nurse or doctor, a fleet manager or insurer, optionally a traffic officer. Keep date, role, three quotes and three pain points. No names, no recordings without consent.</li>
      <li><b>Test:</b> five people, three tasks (the countdown, reading a new report, reporting as a witness), a log of where they hesitated and what we changed.</li>
      <li>With 24 hours left and nobody reachable, write “not yet validated” on the slide and run three or four hallway tests at the hackathon, labelled “hackathon participants, not emergency staff”. Honest beats invented.</li>
    </ul>
  </div>
</section>

<section id="roadmap">
  <div class="sechead"><h2>Roadmap: vehicle link and plug-in box</h2><span class="ref">docs/12 · docs/16</span></div>
  <div class="stages">
    <div class="stage now"><span class="status">Now</span><h3>Phone</h3><p>Accelerometer, gyro and GPS, with a user countdown. This is the product.</p></div>
    <div class="stage"><span class="status">Roadmap · low value</span><h3>Vehicle link</h3><p>A Bluetooth OBD dongle gives wheel speed at 5–10 Hz for a sharper Δv. It gives no airbag status.</p></div>
    <div class="stage"><span class="status">Roadmap</span><h3>Plug-in box</h3><p>A ±200 g sensor, LTE and backup power. The real answer to sensor saturation.</p></div>
    <div class="stage"><span class="status">Vision</span><h3>Vehicle-native</h3><p>eCall-style integration with manufacturers or importers. Needs partners.</p></div>
  </div>
  <figure>
    <div class="fig"><div class="inner">@@05@@</div></div>
    <span class="hint">Scroll the drawing sideways.</span>
    <figcaption><b>Reference design, not built.</b> The only box item in the 48 hours is a simulated ±200 g replay that sends the same packet. Real hardware needs the hero flow stable, a teammate who has built an ESP32 project, the parts in hand, and no risk to the feature freeze. Before any product: decree 26-97 homologation, GSMA TAC, automotive EMC and an operator LTE band check.</figcaption>
  </figure>
</section>

<section id="open">
  <div class="sechead"><h2>What I still need from you</h2></div>
  <ol class="ask">
    <li><b>The clock.</b> Is the end of the 24 hours the pitch itself or the submission? What is the pitch slot, and is it a live demo or a video?</li>
    <li><b>Where the team is.</b> For each gate (skeleton, ingest, dashboard, detector adapter, gateway, slides), is it done, in progress or not started? The plan above assumes nothing is built yet and can be trimmed.</li>
    <li><b>The criteria.</b> Still unknown. Ask an organiser or mentor now: criteria and weights, pitch length, whether prepared building blocks are allowed. I drafted the message.</li>
    <li><b>The gateway phone.</b> The Realme has a SIM, so it can send. The gateway needs a second Android phone with a SIM and credit. Who has one?</li>
    <li><b>Realme numbers.</b> Run T1 and T3 in the first hour and send me the screenshots; the detector’s range setting and 45 Hz floor depend on them.</li>
    <li><b>The pitch deck.</b> Which tool does the team use, and should I build the five-minute deck from the pitch plan now?</li>
  </ol>
</section>

<footer>
  <p>Prepared 30 October 2026 for the Sellekni team. Sources are linked where a fact appears; the full list is in docs/13 §10 and docs/14 §1.</p>
  <p>Decision support only. Sellekni complements the call to the emergency services, never replaces it, and nothing is dispatched automatically.</p>
</footer>
</div>

<script>
(function () {
  var btn = document.getElementById('copy'), code = document.getElementById('wire');
  if (!btn || !code) return;
  btn.addEventListener('click', function () {
    var text = code.textContent.trim();
    function select() { try { var r = document.createRange(); r.selectNodeContents(code); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} btn.textContent = 'Selected'; }
    try {
      navigator.clipboard.writeText(text).then(function () { btn.textContent = 'Copied'; }, select);
    } catch (e) { select(); }
    setTimeout(function () { btn.textContent = 'Copy packet'; }, 1800);
  });
})();
</script>
'''

def label_cells(page, anchor, labels):
    i = page.index(anchor); j = page.index('</table>', i)
    seg = page[i:j]
    def row(m):
        cells = re.split(r'</td><td>', m.group(0))
        out = cells[0]
        for k, c in enumerate(cells[1:]):
            out += '</td><td' + (f' data-l="{labels[k]}"' if k < len(labels) else '') + '>' + c
        return out
    seg = re.sub(r'<tr>(?:(?!</tr>).)*</tr>', row, seg, flags=re.S)
    return page[:i] + seg + page[j:]

out = PAGE
for k in ('01', '02', '03', '04', '05', '06', '07'):
    out = out.replace(f'@@{k}@@', svg[k])
out = label_cells(out, '<th>Criterion</th>', ['What we can claim', 'Next action', 'Score now → after'])
out = label_cells(out, '<th>Fact</th>', ['Source'])
out = label_cells(out, '<th>Block</th>', ['A Mobile', 'B Web and API', 'C Shared, data, gateway', 'D Design, pitch', 'Gate'])
assert '@@' not in out
(HERE / 'sellekni-blueprint.html').write_text(out)
print('wrote sellekni-blueprint.html', len(out) // 1024, 'KB')
