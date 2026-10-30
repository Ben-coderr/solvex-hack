# Sellekni (سلّكني) — run it and test it locally

Prototype for SolveX 3.0 · Problem 1. **Synthetic data only.** Decision support, not a dispatch system.
Project rules and architecture: `DEVELOPMENT.md` and `docs/`.

## 1. Start everything (one command)

```bash
./sellekni up            # Docker → Supabase → .env.local + demo logins → web app (dev mode)
./sellekni open          # Chrome, already signed in: dispatcher + hospital CHU-A + stage window (/demo, /phones)
```

That's it. `./sellekni up` prints the URL, the accounts and the password when it's ready.

| Command | What it does |
|---|---|
| `./sellekni up` | Starts what's missing and skips what's running. Dev mode with hot reload. |
| `./sellekni up --prod` | Production build + `next start`. Faster pages; use it for rehearsals and the stage. |
| `./sellekni up --mobile` | Also starts Metro for the phone app (development build, **not** Expo Go). |
| `./sellekni up --replace` | Another `next dev` for this app is already running somewhere: stop it, start fresh. |
| `./sellekni open [--reset] [--locale=ar] [--no-stage]` | Signed-in Chrome windows: dispatcher, hospital CHU-A, and (DEMO_MODE) the stage window with `/demo` + `/phones`. `--reset` empties the demo data first. |
| `./sellekni login` | Prints the accounts and the password again. |
| `./sellekni status` | Shows what's running and on which port. |
| `./sellekni reset` | Empties incidents, pre-alerts and the audit log (hospitals stay). |
| `./sellekni test` | Runs the unit tests, typecheck and protocol cross-check, then the end-to-end hero flow. |
| `./sellekni logs [web\|mobile]` | Follows a log. Logs live in `.sellekni/`. |
| `./sellekni down [--all]` | Stops the web app and Metro. `--all` stops Supabase too (your data is kept). |

The web app uses port **3000**, or the next free port. Set `PORT=3005 ./sellekni up` to choose one.
To use an app that's already running somewhere else: `BASE_URL=http://localhost:3001 ./sellekni open`.

**Prerequisites (once):** Node 22+, `corepack enable` (pnpm), Docker Desktop **or** colima (`brew install colima docker`),
the Supabase CLI (`brew install supabase/tap/supabase`) and Google Chrome (used by `open` and the tests).

## 2. Log in

Open `http://localhost:3000/login` (the port `./sellekni up` printed).

| Who | Email | Lands on |
|---|---|---|
| Dispatcher (operations room) | `dispatcher@sellekni.test` | `/` dashboard |
| Hospital CHU-A emergency dept | `hospital-a@sellekni.test` | `/hospital/CHU-A` |
| Hospital EPH-B emergency dept | `hospital-b@sellekni.test` | `/hospital/EPH-B` |

**Password:** the same for every account. It's `DEMO_USER_PASSWORD` in `.env.local`, and `./sellekni login` prints it.
It's generated locally and never committed.

Testing by hand? Use a **normal window for the dispatcher and a private window for the hospital**: one browser
window keeps one session. `./sellekni open` does this for you.

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

**Automated:** `./sellekni test`. It resets the demo data and runs the same flow in Chrome
(`apps/web/tests/e2e/hero-flow.spec.ts`). Screenshots: `pnpm --filter web screens:p3 <INCIDENT_ID>`.

## 4. What's simulated (and labelled on screen)

- **SMS gateway:** `SMSGATE_MODE=sim` logs outgoing SMS and sends nothing. The status strip says *SMS gateway: simulated*.
- **Routing:** without OSRM, ETAs are straight-line × 1.4 and tagged *estimated*.
- **Map:** online tiles (OpenFreeMap), flagged **ONLINE TILES**, until `apps/web/public/tiles/sellekni.pmtiles` exists.
- **DEMO banner:** shown whenever `DEMO_MODE=true` (needed for Simulate SMS, `/demo`, `/phones`).
- **Facilities** are "(illustrative)" with invented positions and capabilities.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `Docker is not running` | Open Docker Desktop, or `colima start`. |
| `another 'next dev' already runs for apps/web` | `./sellekni up --replace`, or `./sellekni up --prod` (runs alongside). |
| Login says *Wrong email or password* | `./sellekni up` again (it re-creates the demo logins), then `./sellekni login`. |
| Signed in as a hospital but want the dashboard | Sign out (top-right icon) or use another window: one session per window. |
| Dashboard doesn't update by itself | Look at *Live updates* in the status strip. The page also refreshes every 15 s as a fallback. |
| A page shows old code after you deleted or moved a file | Restart: `./sellekni down && ./sellekni up`. |
| Port already used | `PORT=3005 ./sellekni up` |
| Anything else | `./sellekni status`, then `./sellekni logs web`. Supabase logs: `.sellekni/supabase.log`. Studio: http://127.0.0.1:54323 |
