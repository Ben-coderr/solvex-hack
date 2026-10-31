# 08 — Free deployment (and a demo that cannot be killed by the venue Wi-Fi)

> Free-tier facts below were checked on **2026-10-30**. Free tiers change: before relying on a limit, open the vendor's pricing page. Anything with a ⚠ is a limit that has bitten hackathon teams.

## 1. Strategy: local-first, cloud as backup

```
PRIMARY (on stage)                         BACKUP (also gives judges a URL)
Laptop on your own hotspot / LAN           Vercel Hobby  (Next.js: dashboard + API)
 ├ supabase start   (Postgres+PostGIS      Supabase Free (Postgres+PostGIS+Realtime)
 │                   +Realtime, Docker)    OpenRouteService free key (ETA fallback)
 ├ pnpm start       (Next.js, port 3000)
 ├ OSRM Docker      (port 5000)
 └ SMS gateway phone on the same network
Phones: APK sideloaded, pointing at http://<laptop-ip>:3000
```
Why: the venue network is the #1 killer of live demos. The SMS path is independent of venue internet by design, and the local stack does not need it either. The cloud copy exists so jurors can open the dashboard/witness page on their own phones (QR) and so you have a fallback if the laptop dies.

## 2. Free tier map

| Component | Primary (local) | Free cloud option | Limits that matter |
|---|---|---|---|
| Database + realtime | `supabase start` (Docker) | **Supabase Free** | 2 active projects · 500 MB DB · 200 concurrent Realtime connections · 2 M Realtime msgs/month · ⚠ **pauses after 7 days of inactivity**: open it the day before and during the event |
| Web + API | `pnpm build && pnpm start` | **Vercel Hobby** | ⚠ **non-commercial use only** (fine for a hackathon, not for a launch) · 100 GB bandwidth · ~1 M edge requests/month · 100 deployments/day |
| Web alt | | **Cloudflare Pages/Workers** (Next.js via OpenNext) | unlimited bandwidth; Workers 100k requests/day; more setup |
| Web alt (Python/Node API) | | Render free web service | ⚠ sleeps after 15 min idle, ~1 min cold start, 750 h/month; free Postgres only 256 MB. Use only with a keep-warm ping, never as the stage primary |
| Routing | OSRM Docker + Geofabrik Algeria extract | **OpenRouteService** free key | 2,000 directions/day · 500 matrix/day · 40/min |
| Maps | PMTiles file (served from `/public` or the laptop) | Protomaps public builds as the *source* of your extract | no live tile server needed |
| SMS in/out | SMS Gateway for Android (capcom6) on a spare phone with a local SIM | — | SMS costs are your SIM's; no cloud SMS provider needed |
| Tunnel for the webhook (if you need HTTPS to the laptop) | | **Cloudflare Tunnel** (free) or ngrok free | URL changes on free ngrok; set it right before the demo |
| Mobile builds | `npx expo run:android`, `eas build --local`, or Gradle on the laptop (unlimited) | EAS Build free tier | EAS free = a *limited quantity of low-priority builds* per month (sources disagree on the number; check expo.dev/pricing). Don't plan around it |
| CI | | **GitHub Actions** | free minutes for public repos; private repos have a monthly quota |
| Error tracking | `console` + audit log | (skip) | not needed for a hackathon |
| Domain | `sellekni.local` (hosts file) / LAN IP | free `*.vercel.app` | don't spend money on a domain |
| Railway / Fly.io | — | **not free** | don't plan on them |

## 3. Step-by-step

### 3.1 Local stack (do on day −2)
```bash
# 1. Supabase (needs Docker)
supabase init            # once
supabase start           # prints API URL, anon key, service_role key → copy into .env
supabase db reset        # applies migrations + seed.sql  ← this is the schema validation step
# 2. OSRM (once, needs internet + RAM; see docs/04 §7)
docker compose up -d osrm
# 3. Web
pnpm install && pnpm --filter web build && pnpm --filter web start    # http://localhost:3000
# 4. Make the laptop reachable by phones
#    Windows: allow Node through the firewall (private network). Find the IP: ipconfig / ip addr
#    Your own phone hotspot or a travel router is better than venue Wi-Fi.
# 5. Smoke test from a phone browser: http://<laptop-ip>:3000/api/health
```
### 3.2 SMS gateway phone
1. Install **SMS Gateway for Android** (capcom6; Apache-2.0) on a spare Android with a SIM that has coverage in the demo room (test all three operators the day before and pick the strongest).
2. Choose **local server mode** (phone and laptop on the same network) or **cloud mode** (phone talks to the vendor's server; you then need a public HTTPS webhook URL → Cloudflare Tunnel). *Read docs.sms-gate.app first:* confirm webhook event names, payload fields, signing, and the send endpoint, then update `gateway.ts` and its fixtures.
3. Webhook target: `POST https://<tunnel>/api/sms/inbound` with your `SMSGATE_WEBHOOK_SECRET` as the app's signing key. The app only sends webhooks to HTTPS with a valid certificate (plain HTTP only to `127.0.0.1`), so `http://<laptop-ip>:3000` is refused: keep the gateway phone on USB and use `adb reverse tcp:3000 tcp:3000` with the webhook at `http://127.0.0.1:3000/api/sms/inbound` (or a Cloudflare quick tunnel). Steps: `docs/field-notes/G4-drill.md`.
4. Disable battery optimisation for the app, keep the phone on charge, screen on during the demo.
5. Test: send an SMS from another phone containing `SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E` → pin appears.

### 3.3 Cloud backup (do on day −1)
1. **Supabase:** create a project (region closest to Algeria is typically Europe: pick the nearest), `supabase link --project-ref <ref>`, `supabase db push`, run the seed. Add the URL/keys to Vercel env.
2. **Vercel:** `vercel link` → add env vars from `.env.example` (service-role key as a *server* variable) → `vercel --prod`. Set `DEMO_MODE=true` only on the preview you use for the demo.
3. **Data residency note:** Law 18-07 requires ANPDP authorisation for transfers of personal data abroad. The hackathon demo uses **synthetic data only**; say so. Production hosting should be in Algeria.
4. **Keep-warm (only if you used Render):** a GitHub Actions cron hitting `/health` every 14 min. Not needed on Vercel/Supabase.
5. Open both URLs from a phone on mobile data to verify.

### 3.4 CI (GitHub Actions) — one workflow, four jobs
`shared` (pnpm test + typecheck + python crosscheck) · `tokens` (contrast test) · `web` (typecheck, build, vitest) · `mobile` (typecheck, jest/vitest for detector and outbox). Start `supabase start` in the web job only if you run integration tests. Add the badge to the README.

### 3.5 Distributing the APK
`eas build -p android --profile preview --local` (or Gradle `assembleRelease`) → `adb install -r app-release.apk` on each phone, or share the file by USB/QR. Android will ask to allow installs from unknown sources. Bring a USB cable and a laptop with `adb` to the venue.

## 4. Demo-day resilience ladder (print this)

1. **Live, real SMS** (gateway phone) →
2. **Live, "Simulate SMS" button** (same ingest code, no radio) →
3. **Live, replay mode on a phone, HTTPS over hotspot** →
4. **Backup screen recording**, narrated, started from the same step →
5. **Slides with screenshots.**
Rule: if any step stalls for more than 5 seconds, say "let me show you the recorded run" and switch at the same step. Never debug live in front of the jury.

**Checklist (T-60 min):** laptop 100% + charger · `supabase start`, OSRM and `pnpm start` up · `/api/health` green on every device · gateway phone charged, signal bars ≥ 3, test SMS delivered · demo phones: APK installed, permissions granted, battery optimisation off, airplane-mode drill done · hotspot on · `DEMO reset` pressed · browser tabs pre-opened (dashboard, /phones, /demo, hospital view) · backup video on the desktop **and** a USB stick · PMTiles loads with Wi-Fi off · Supabase cloud project awake (pauses after 7 idle days) · slides exported to PDF.

## 5. Costs
Everything above is €0/DZD 0 except the SIM credit for the gateway phone (a few SMS). Production cost drivers to mention honestly: SMS fees (per alert ≈ one outbound ACK + one pre-alert), hosting in Algeria, an operator short-code agreement. **Do not quote a DZD figure for production costs unless you have a real quote.**
