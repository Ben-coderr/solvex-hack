# NAJDA (نجدة) — run it and test it locally

Prototype for SolveX 3.0 · Problem 1. **Synthetic data only.** Decision support, not a dispatch system.
Project rules and architecture: `DEVELOPMENT.md` and `docs/`.

## 1. Start everything (one command)

```bash
./najda up            # Docker → Supabase → .env.local + demo logins → web app (dev mode)
./najda open          # Chrome opens 2 windows, already signed in: dispatcher + hospital CHU-A
```

That's it. `./najda up` prints the URL, the accounts and the password when it's ready.

| Command | What it does |
|---|---|
| `./najda up` | Starts what's missing and skips what's running. Dev mode with hot reload. |
| `./najda up --prod` | Production build + `next start`. Faster pages; use it for rehearsals and the stage. |
| `./najda up --mobile` | Also starts Metro for the phone app (development build, **not** Expo Go). |
| `./najda up --replace` | Another `next dev` for this app is already running somewhere: stop it, start fresh. |
| `./najda open [--reset] [--locale=ar]` | Signed-in Chrome windows (`--reset` empties the demo data first). |
| `./najda login` | Prints the accounts and the password again. |
| `./najda status` | Shows what's running and on which port. |
| `./najda reset` | Empties incidents, pre-alerts and the audit log (hospitals stay). |
| `./najda test` | Runs the unit tests, typecheck and protocol cross-check, then the end-to-end hero flow. |
| `./najda logs [web\|mobile]` | Follows a log. Logs live in `.najda/`. |
| `./najda down [--all]` | Stops the web app and Metro. `--all` stops Supabase too (your data is kept). |

The web app uses port **3000**, or the next free port. Set `PORT=3005 ./najda up` to choose one.
To use an app that's already running somewhere else: `BASE_URL=http://localhost:3001 ./najda open`.

**Prerequisites (once):** Node 22+, `corepack enable` (pnpm), Docker Desktop **or** colima (`brew install colima docker`),
the Supabase CLI (`brew install supabase/tap/supabase`) and Google Chrome (used by `open` and the tests).

## 2. Log in

Open `http://localhost:3000/login` (the port `./najda up` printed).

| Who | Email | Lands on |
|---|---|---|
| Dispatcher (operations room) | `dispatcher@najda.test` | `/` dashboard |
| Hospital CHU-A emergency dept | `hospital-a@najda.test` | `/hospital/CHU-A` |
| Hospital EPH-B emergency dept | `hospital-b@najda.test` | `/hospital/EPH-B` |

**Password:** the same for every account. It's `DEMO_USER_PASSWORD` in `.env.local`, and `./najda login` prints it.
It's generated locally and never committed.

Testing by hand? Use a **normal window for the dispatcher and a private window for the hospital**: one browser
window keeps one session. `./najda open` does this for you.

## 3. Test the hero flow (≈ 90 s)

1. **Dispatcher:** click **Simulate SMS** → *Rollover, no response (auto)* → **Send** → `Esc`.
   A red ▲ pin appears on the map and in the queue (*Auto · unconfirmed*).
2. Click the pin: the drawer shows **R 75**, confidence, the 3 reasons and the disclaimer.
3. In the lifecycle bar, click **Acknowledged**.
4. In **Orientation**, check that CHU-A is ranked #1 and that *Nearest ED* is visible. Hover a card to see the route, then click **Dispatched**.
5. Click **Pre-alert** on CHU-A: you'll see *Pre-alert sent hh:mm · web card + SMS*.
6. **Hospital window:** the patient card appears with an arrival countdown. Click **Acknowledge**.
7. **Dispatcher:** *✓ Acknowledged hh:mm* appears without a reload.
8. **Audit log** (top bar): every step is listed with who, what, before/after and when.

**Also try:**
- **Change band…** or **Choose…** another facility: Confirm stays disabled until you type a reason (5+ characters).
- **Paste SMS** with garbage text: it's kept and shown under *Unparsed messages*.
- **False alarm…**: it needs a reason, and the incident leaves the queue.
- Language switch (العربية / Français / English) and the sun/moon theme button.
- Don't acknowledge on the hospital side: after 2 min the dispatcher sees a warning.

**Automated:** `./najda test`. It resets the demo data and runs the same flow in Chrome
(`apps/web/tests/e2e/hero-flow.spec.ts`). Screenshots: `pnpm --filter web screens:p3 <INCIDENT_ID>`.

## 4. What's simulated (and labelled on screen)

- **SMS gateway:** `SMSGATE_MODE=sim` logs outgoing SMS and sends nothing. The status strip says *SMS gateway: simulated*.
- **Routing:** without OSRM, ETAs are straight-line × 1.4 and tagged *estimated*.
- **Map:** online tiles (OpenFreeMap), flagged **ONLINE TILES**, until `apps/web/public/tiles/najda.pmtiles` exists.
- **DEMO banner:** shown whenever `DEMO_MODE=true` (needed for Simulate SMS, `/demo`, `/phones`).
- **Facilities** are "(illustrative)" with invented positions and capabilities.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `Docker is not running` | Open Docker Desktop, or `colima start`. |
| `another 'next dev' already runs for apps/web` | `./najda up --replace`, or `./najda up --prod` (runs alongside). |
| Login says *Wrong email or password* | `./najda up` again (it re-creates the demo logins), then `./najda login`. |
| Signed in as a hospital but want the dashboard | Sign out (top-right icon) or use another window: one session per window. |
| Dashboard doesn't update by itself | Look at *Live updates* in the status strip. The page also refreshes every 15 s as a fallback. |
| A page shows old code after you deleted or moved a file | Restart: `./najda down && ./najda up`. |
| Port already used | `PORT=3005 ./najda up` |
| Anything else | `./najda status`, then `./najda logs web`. Supabase logs: `.najda/supabase.log`. Studio: http://127.0.0.1:54323 |
