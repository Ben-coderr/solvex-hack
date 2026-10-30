# 04 — Architecture and Exact Stack

> Versions below were verified on **2026-10-30**. Re-check anything marked *(verify)* the day you start: this ecosystem moves weekly.
> Principle: **one language (TypeScript) end to end**, so the protocol codec, scoring and ranking in `packages/shared` are written once and imported by the phone, the dashboard and the API.

---

## 1. Decisions at a glance

| Layer | Choice | Why | If it fails |
|---|---|---|---|
| Mobile | **Expo SDK 58** (React Native 0.88), **Expo Router**, TypeScript strict, **development build** (never Expo Go) | You need custom native code (silent SMS), so Expo Go is out. Expo gives OTA-free fast iteration + a huge ecosystem | none needed; it is the requirement |
| Native bits | **One local Expo Module** (Kotlin) `najda-native`: `sendSms()` via `SmsManager`, SIM selection, sent/delivered events | `expo-sms` only *opens the composer*, it cannot send silently | `expo-sms` composer (user taps Send) → HTTPS → clipboard |
| Styling | Design tokens (`packages/tokens`) → NativeWind (Tailwind classes) via the `expo-tailwind-setup` skill | Same tokens on web and mobile | plain `StyleSheet` + `tokens` (30 min to switch; do not fight NativeWind for hours) |
| Motion | Reanimated 4 + `react-native-svg` | countdown ring, g-force graph, pin pulse | simpler `Animated` |
| Dashboard | **Next.js 16** (App Router, React 19), Tailwind CSS v4, shadcn/ui, lucide icons | SSR + route handlers = UI and API in one deployable | Vite SPA + Hono |
| Maps | **MapLibre GL JS** + **PMTiles** (offline vector tiles) via `react-map-gl/maplibre` | Works with zero internet; no tile-server; OSM tile policy forbids bulk offline scraping of the public raster servers | Leaflet + online OSM tiles (light use only) |
| Backend | **Supabase**: Postgres + **PostGIS**, Auth, **Realtime**; server logic in **Next.js route handlers** (Node runtime) | No separate API server; realtime push for free; runs locally with `supabase start` (Docker) | FastAPI + Postgres (see §10) |
| Routing/ETA | **OSRM** (Docker, Geofabrik Algeria) → **OpenRouteService** (free key) → haversine × 1.4 | Offline-capable primary, two fallbacks, never blocks | |
| SMS in | **SMS Gateway for Android** (capcom6, Apache-2.0) on a spare phone with a local SIM; webhook `sms:received` | Free, real Algerian number, no operator contract | "Paste SMS" box + "Simulate SMS" button on the dashboard |
| SMS out | same gateway (ACK, hospital pre-alerts) | | log-only `sim` backend |
| i18n | Arabic (RTL) · French · English: `i18next` (mobile), `next-intl` (web) | | |
| Tests | `node:test` + `tsx` (shared), Vitest (web/mobile logic), Playwright (E2E), Python cross-check | | |
| Hosting | **Local laptop = primary** · Vercel Hobby + Supabase Free = backup | See `08-FREE-DEPLOYMENT.md` | |

Why **not** the usual alternatives: Firebase (SMS webhook + PostGIS + scoring in one place is awkward), Flutter (the team asked for Expo/React), Twilio inbound (Algerian inbound numbers unverified; costs), Expo MCP server (needs a paid EAS plan), Google Maps (billing + offline limits).

---

## 2. Monorepo layout

```
najda/
├─ apps/
│  ├─ mobile/                 Expo app (Android-first)
│  │  ├─ app/                 Expo Router routes: (tabs)/, drive, countdown, witness, sent, settings
│  │  ├─ src/
│  │  │  ├─ detector/         PURE crash state machine + replay engine (unit-tested)
│  │  │  ├─ outbox/           expo-sqlite persistent queue + fallback chain
│  │  │  ├─ channels/         https.ts · sms.ts (native module) · composer.ts · clipboard.ts
│  │  │  ├─ ui/               PacketChip, GoldenRing, TriageMarker, SosButton ...
│  │  │  └─ i18n/             ar.json fr.json en.json
│  │  ├─ modules/najda-native/   local Expo module (Kotlin)
│  │  └─ app.json, eas.json
│  └─ web/                    Next.js 16
│     ├─ app/
│     │  ├─ (dispatch)/       / (map+queue), incidents/[id], hospitals, audit, history
│     │  ├─ hospital/[id]/    hospital ED view (capability link or login)
│     │  ├─ crew/[id]/        ambulance crew form (capability link)
│     │  ├─ w/[id]/           witness page (no install, token link, rate-limited)
│     │  ├─ phones/ demo/     virtual phones + demo controls (DEMO_MODE only)
│     │  └─ api/              route handlers (see §6)
│     └─ src/{server,components,lib,i18n}
├─ packages/
│  ├─ shared/                 DZ-MSD codec, NSI, ranking, merge (DONE + tested)
│  └─ tokens/                 design tokens + WCAG tests → tokens.css, theme.ts (DONE + tested)
├─ supabase/                  config.toml, migrations/, seed.sql
├─ data/                      hospitals.seed.json, traces/*.csv (replay), osrm/, tiles/
├─ docs/                      this folder
├─ scripts/                   hooks, seed, overpass-hospitals.ts, make-eta-cache.ts, reset-demo.sh
└─ docker-compose.yml         OSRM (+ optional services)
```

Layering inside `apps/web/src/server` (same discipline as a domain-driven backend): `domain/` = pure functions from `@najda/shared` (no I/O) → `services/` = orchestration with DB/HTTP (`ingest`, `lifecycle`, `prealert`, `routing`, `sms`) → `app/api/**` route handlers = thin (validate with zod, call a service, return JSON). No business logic in route handlers, no I/O in `packages/shared`.

---

## 3. Mobile architecture

### 3.1 What runs where (honest limits)

| Capability | MVP approach | Limit / stretch |
|---|---|---|
| Sensing | **"Drive mode"**: foreground screen + `expo-keep-awake` + `expo-sensors` accelerometer/gyroscope at the fastest rate the phone allows (typ. 50–100 Hz, *device-dependent*) + `expo-location` with an Android **foreground service** notification so GPS and the process survive | `expo-sensors` stops in the background. **Stretch G1:** a Kotlin foreground service with a `SensorManager` listener that streams samples to JS |
| Demo | **Replay mode**: a CSV trace is fed through the *same* detector (t, ax, ay, az, gx, gy, gz, speed) | this is the stage safety net, always keep it |
| Silent SMS | Kotlin module → `SmsManager.sendTextMessage` | needs `SEND_SMS` (Play-restricted → **sideload the APK**); dual-SIM: pick the subscription id; iOS cannot do it |
| Voice call | `Linking.openURL('tel:14')` opens the **dialler** (user presses call) | never auto-dial without the user |
| ACK back | HTTPS response is the ACK. For the SMS path: delivery report now; incoming "NAJDA ACK" SMS via a `RECEIVE_SMS` receiver is **stretch G2** | |
| Voice prompts | `expo-speech` (check the device has Arabic TTS data; pre-record MP3 fallbacks with `expo-audio`) | |

### 3.2 Detection state machine (pure TypeScript in `src/detector`, unit-tested with synthetic traces)

```
IDLE ──(GPS speed > 25 km/h for ≥ 10 s)──▶ ARMED            speed gate (phone drops while walking never arm)
ARMED  keeps a 10 s ring buffer: |a| in g, gyro, speed (1 Hz)
CANDIDATE if any:
  (a) peak ≥ 4 g  AND high-g (≥ 2.5 g) lasts ≥ 30 ms AND speed drop ≥ 20 km/h within 3 s
  (b) peak ≥ 8 g  AND speed drop ≥ 10 km/h within 3 s
  (c) rollover: integrated rotation ≥ 90° within 2 s AND speed was > 25 km/h
CONFIRM  if within 5 s the vehicle is stopped (speed < 5 km/h)
  → COUNTDOWN 30 s (alarm + vibration + AR/FR voice, big "I'm OK" and "SEND HELP NOW")
       "I'm OK"        → cancel, log a false-positive sample (opt-in), back to ARMED
       "SEND HELP NOW" → alert at once (source flag: conscious)
       no response     → alert with flag N
DISARM after speed < 10 km/h for > 3 min
```
All thresholds are **ASSUMPTIONS to tune** with team-recorded drops/brakes/bumps (sources: WreckWatch 4 g floor + speed gate; Apple 10+30 s and Google 60 s countdowns). Demo mode shortens the countdown to 10 s and **says so on screen**.
Derived physics: `dv` = max speed in the 3 s before − min speed in the 3 s after (coarse, 1 Hz GPS); `peak_g`; `rollover`; `multi_impact` (≥ 2 candidate peaks in 5 s).
Manual paths (always available): SOS long-press, and the **witness mode** (5 taps, no sensors, no account).

### 3.3 Outbox and fallback chain (offline-first)

```
alert(packet):
  outbox.persist(packet)                      // expo-sqlite; survives kill/reboot
  open dialler on 14 (user may switch to 1021/1055)
  loop until ACK or 30 min:
    if online (2 s HEAD /api/health, not just "connected"):
        POST /api/incidents (full JSON, 8 s)  → ACK(https)
        else POST compact JSON (<1 KB, 15 s)   → ACK(https)
    if SMS ready: native sendSms(GW1, wire)    → wait delivery report / ACK SMS (60 s)
    else expo-sms composer prefilled with the wire text (user taps Send)
    GW2 / second operator SIM if configured
    emergency contacts get a human-readable AR/FR text (UCS-2 allowed here)
    backoff 10 s·2ⁿ (cap 5 min); retry immediately on connectivity change
```
Duplicates are harmless: ingest is idempotent on `incident_id`. Show "Received by rescuers / تم الاستلام" + time on the ACK.

### 3.4 Native module contract (write this first, implement second)

```ts
// modules/najda-native/src/index.ts
export type SmsResult = { id: string; status: 'sent' | 'delivered' | 'failed'; code?: number };
export function getSimInfo(): Promise<{ subscriptionId: number; carrier: string; slot: number }[]>;
export function sendSms(to: string, text: string, opts?: { subscriptionId?: number; id: string }): Promise<void>; // result arrives as an event
export function addSmsListener(cb: (r: SmsResult) => void): { remove(): void };
```
Kotlin: `SmsManager.sendTextMessage(to, null, text, sentPI, deliveredPI)`; `SmsManager.createForSubscriptionId(subId)` for dual-SIM; split with `divideMessage` only if > 160 septets (it should never be); broadcast receivers for the PendingIntents emit the events. Android 13+ needs the runtime `SEND_SMS` request (`PermissionsAndroid`). Use the `expo-module` skill and the Expo "Modules API" docs; scaffold with `npx create-expo-module@latest --local`.
`app.json` → `android.permissions`: `SEND_SMS`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`.

### 3.5 Build and install (no Play Store)
- Local dev build: `npx expo run:android` (Android Studio SDK + JDK 17). Release APK for the demo phones: `eas build -p android --profile preview --local` (eas.json: `distribution: "internal"`, `android.buildType: "apk"`) or Gradle `assembleRelease`. Local builds are unlimited and free; EAS cloud free builds are limited and low-priority (check expo.dev/pricing).
- **Do this on day −2:** build once, install on both demo phones, whitelist from battery optimisation, grant all permissions, run the airplane-mode drill.

---

## 4. Web / dashboard architecture

| Route | Audience | Auth |
|---|---|---|
| `/` map + incident queue | Dispatcher | Supabase Auth, role `dispatcher` |
| `/incidents/[id]` detail, lifecycle, orientation, pre-alert | Dispatcher | role |
| `/hospital/[id]` incoming patients, ACK, status toggle | Hospital ED | login **or** signed capability link |
| `/crew/[id]?k=…` crew assessment form | Ambulance crew | HMAC-signed link (`jose`), expires |
| `/w/[id]?k=…` witness page (4 fields) | Anyone with the link | unguessable token `k` in the link (a 5-char id alone is guessable); rate-limited; shows only a coarse location (~100 m) and no victim data |
| `/phones`, `/demo` | Team on stage | `DEMO_MODE=true` only |

- **Realtime:** the browser subscribes to Supabase Realtime `postgres_changes` on `incidents`, `reports`, `assessments`, `prealerts` (RLS: only users with a `profiles.role` may select). Free-tier limits: 200 concurrent connections, 2 M messages/month: plenty.
- **Map:** `react-map-gl/maplibre` + `pmtiles` protocol + `@protomaps/basemaps` style; pins are the `TriageMarker`; route lines from OSRM geometry (polyline).
- **State:** server state with TanStack Query + Realtime invalidation; UI state with Zustand.
- **i18n/RTL:** `next-intl`; set `<html dir lang>` per locale; logical CSS only.

---

## 5. Data model (PostgreSQL 15+ / PostGIS) — design

> Written for the team to implement as `supabase/migrations/0001_init.sql`. **Not executed in the sandbox where this pack was built:** `supabase db reset` is your validation step (phase P1).

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;

create type band as enum ('R','O','Y','G','U');
create type incident_status as enum
  ('RECEIVED','ACKNOWLEDGED','DISPATCHED','EN_ROUTE','ON_SCENE','TRANSPORTING','AT_HOSPITAL','CLOSED','CANCELLED','MERGED');

create table profiles (               -- one row per auth user
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('dispatcher','hospital','admin')),
  hospital_id text, display_name text
);

create table hospitals (
  id text primary key,                -- e.g. 'CHU-A'
  name text not null, level char(1) not null check (level in ('A','B','C')),
  wilaya_code smallint, phone_sms text,
  capabilities text[] not null default '{}',   -- ed24, trauma_surgery, ct, icu, neurosurgery, pediatrics, burns, general_surgery
  location geography(Point,4326) not null,
  source text not null default 'manual', verified boolean not null default false
);
create index on hospitals using gist (location);

create table hospital_status (
  hospital_id text references hospitals on delete cascade,
  status text not null check (status in ('OK','BUSY','SATURATED')),
  set_by text not null, set_at timestamptz not null default now(),
  primary key (hospital_id, set_at)
);                                    -- latest row wins; older than 6 h = UNKNOWN (done in code)

create table incidents (
  id char(5) primary key,             -- first client id; merged incidents keep it
  status incident_status not null default 'RECEIVED',
  band band not null, nsi smallint not null, conf char(1) not null,
  location geography(Point,4326) not null, plus_code text,
  crashed_at timestamptz not null, first_channel text not null,    -- 'https' | 'sms' | 'paste' | 'witness'
  merged_count smallint not null default 1, assigned_unit text,
  hospital_id text references hospitals, wilaya_code smallint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on incidents using gist (location);
create index on incidents (status, created_at desc);

create table reports (                -- append-only; one row per received message
  id uuid primary key default gen_random_uuid(),
  incident_id char(5) references incidents on delete cascade,
  client_id char(5) not null,         -- the packet's id (a repeated id = update)
  channel text not null, source text not null,   -- source: auto|witness|sos|crew
  raw text not null, parsed jsonb, parse_error text,
  sender_hash text, received_at timestamptz not null default now()
);
create unique index on reports (client_id, channel, md5(raw));   -- idempotent re-delivery

create table assessments (            -- every recompute (server-authoritative)
  id uuid primary key default gen_random_uuid(),
  incident_id char(5) references incidents on delete cascade,
  version int not null, band band not null, nsi smallint not null, conf char(1) not null,
  reasons jsonb not null, inputs jsonb not null, engine_version text not null,
  created_at timestamptz not null default now()
);

create table prealerts (
  id uuid primary key default gen_random_uuid(),
  incident_id char(5) references incidents on delete cascade,
  hospital_id text references hospitals, channel text not null,   -- 'web' | 'sms'
  body text, sent_at timestamptz not null default now(), acked_at timestamptz, acked_by text
);

create table audit_events (           -- immutable: no UPDATE/DELETE policy; revoke at role level
  id bigint generated always as identity primary key,
  incident_id char(5), actor text not null, action text not null,
  before jsonb, after jsonb, reason text, at timestamptz not null default now()
);

create table eta_cache (origin_key text, hospital_id text, minutes real, km real, source text,
  computed_at timestamptz default now(), primary key (origin_key, hospital_id));

create table sms_outbox (id uuid primary key default gen_random_uuid(), to_number text, body text,
  purpose text, status text default 'queued', created_at timestamptz default now(), sent_at timestamptz);
```

**RLS (enable on every table):** authenticated users with a `profiles` row can `select` incidents/reports/assessments/prealerts/hospitals; hospital users only their own pre-alerts; **all writes go through route handlers with the service-role key** (server only, never shipped to browser or phone). Medical profile data (if you build it) lives in its own table with short retention and no select policy for anyone but the incident's dispatcher.
**Merge in SQL:** `select id from incidents where status not in ('CLOSED','CANCELLED','MERGED') and ST_DWithin(location, ST_MakePoint($lon,$lat)::geography, 300) and crashed_at between $t - interval '10 minutes' and $t + interval '10 minutes' order by crashed_at limit 1 for update;`

---

## 6. API (Next.js route handlers)

| Method & path | Purpose | Notes |
|---|---|---|
| `POST /api/incidents` | ingest JSON from the app | `x-najda-key`, zod, idempotent, rate-limited; returns `201 {incident_id, assessment, ack}` |
| `POST /api/sms/inbound` | SMS gateway webhook (+ "Paste SMS") | webhook secret/HMAC; **always 200 after storing**, even if unparsed; queue the ACK SMS |
| `POST /api/witness/[id]` | witness web page | token `k` required; rate-limited by IP hash |
| `POST /api/crew/[id]` | crew assessment (GCS/SBP/SpO₂/HR/ETA) | signed link; re-runs `assess()` |
| `GET /api/incidents?status=open` · `GET /api/incidents/[id]` | queue / detail | dispatcher |
| `PATCH /api/incidents/[id]` | transition / override | **reason required** on override; writes `audit_events` |
| `GET /api/incidents/[id]/recommendations` | top-3 hospitals + `nearestEd` | `rankHospitals()` + ETA service |
| `POST /api/incidents/[id]/prealert` | web card + SMS to the hospital | creates `prealerts` + `sms_outbox` |
| `POST /api/hospitals/[id]/status` | OK/BUSY/SATURATED (web or SMS `NJ STATUS CHU-A SAT`) | decays after 6 h |
| `POST /api/demo/reset` · `POST /api/demo/replay` | demo only | `DEMO_MODE` |
| `GET /api/health` | connectivity probe (HEAD ok) | no DB hit |

**SMS gateway parsing:** isolate everything gateway-specific in `src/server/services/sms/gateway.ts` (`parseInbound(body)`, `sendSms()`), with recorded fixtures. **Before coding it, open docs.sms-gate.app** and confirm the webhook event/field names and the send endpoint; the names in the old plan (`payload.phoneNumber`, `payload.message`, `receivedAt`) were never confirmed. If cleartext HTTP to a LAN address is blocked by the phone app, use a free Cloudflare Tunnel for an HTTPS URL.

**Hospital pre-alert SMS template (GSM-7, no accents):**
`NAJDA PRE-ALERTE K7Q2M R75 ETA 24min. 1 victime. Tonneau, dv~71km/h, SpO2 89, pas de reponse. Repondre OK K7Q2M`

---

## 7. Routing service
`getEtaMatrix(origin, hospitals)`: try OSRM `/table/v1/driving/…?sources=0&annotations=duration` (timeout 2.5 s) → OpenRouteService `POST /v2/matrix/driving-car` (free key: 2,000 directions/day, 500 matrix/day, 40/min; cache aggressively) → haversine × 1.4. Round up; cache by 100 m grid cell in `eta_cache`. Every ETA carries its `source`; the UI shows a small "estimated" tag for the fallback.
OSRM prep (do once, at home, with internet): `curl -O https://download.geofabrik.de/africa/algeria-latest.osm.pbf` → `osrm-extract -p /opt/car.lua algeria-latest.osm.pbf` → `osrm-partition` → `osrm-customize` → `osrm-routed --algorithm mld`. Budget: Algeria is big (RAM and disk); if the build struggles, extract only the demo region with `osmium extract -b`. Note the OSRM public demo server is not for production use.

## 8. Hospital data
1. `scripts/overpass-hospitals.ts` queries Overpass for `amenity=hospital` (+ `emergency=yes`) in your demo region(s) and writes a CSV.
2. A human curates `capabilities` and `level` in the CSV (phone calls, ministry lists, your organisers: see `11-…` question list). **Do not invent capabilities.** Until verified, `verified=false` and the UI says "pilot data".
3. `data/hospitals.seed.json` ships with clearly fake "(illustrative)" entries so the demo works.

## 9. Environments
| | Primary (stage) | Backup | CI |
|---|---|---|---|
| DB + Realtime | `supabase start` on the laptop | Supabase Free project | `supabase start` in Actions |
| Web | `pnpm build && pnpm start` on the laptop | Vercel Hobby | `pnpm build` |
| Routing | OSRM Docker on the laptop | ORS / haversine | mocked |
| SMS | gateway phone on the same hotspot/LAN | "Simulate SMS" | fixtures |
| Phones | APK sideloaded | | |
Phones reach the laptop at `http://<laptop-LAN-ip>:3000` (Android cleartext to a LAN IP needs `usesCleartextTraffic` in the app config for the demo build only; production = HTTPS).

## 10. If the team prefers Python / FastAPI
Keep Next.js for the UI and move `services/` to FastAPI (async, Pydantic v2, SQLAlchemy 2, asyncpg, `/docs` for the jury). Port `packages/shared` using `scripts/crosscheck.py` (strict decoder + encoder + NSI) as the seed and the **same JSON vectors** as the contract (run them in pytest *and* in the TS tests). You lose the single-language benefit and gain a second deploy target (Render free sleeps after 15 min and cold-starts in about a minute: not good for a live demo).

## 11. Package list (use `npx expo install …` so versions match SDK 58)
**Mobile:** `expo expo-router expo-dev-client expo-sensors expo-location expo-task-manager expo-keep-awake expo-speech expo-audio expo-haptics expo-sqlite expo-secure-store expo-localization expo-crypto expo-sms expo-font expo-network @react-native-community/netinfo react-native-reanimated react-native-worklets react-native-gesture-handler react-native-svg react-native-safe-area-context react-native-screens @expo-google-fonts/ibm-plex-sans-arabic @expo-google-fonts/ibm-plex-mono @expo-google-fonts/bricolage-grotesque i18next react-i18next zustand zod lucide-react-native` (+ `nativewind tailwindcss` per the skill).
**Web:** `next react react-dom typescript tailwindcss @tailwindcss/postcss shadcn lucide-react maplibre-gl react-map-gl pmtiles @protomaps/basemaps @supabase/supabase-js @supabase/ssr zod next-intl motion zustand @tanstack/react-query jose qrcode` · dev: `vitest @playwright/test`.
**Workspace:** `@najda/shared`, `@najda/tokens` (`workspace:*`).

## 12. Pitfalls checklist (all verified)
- `expo-sms` cannot send silently. Silent send needs our Kotlin module; random npm "silent SMS" packages are unvetted.
- `SEND_SMS` is a Play-restricted permission → **sideload**; iOS can never send silently.
- `expo-sensors` accelerometer stops in the background → foreground "Drive mode" + replay mode for the demo.
- Dual-SIM: SMS goes out on the default SMS SIM unless you pick a subscription id.
- Expo MCP server needs a paid EAS plan → we use Context7 + Expo docs + Expo skills instead.
- Vercel Hobby is non-commercial; Render free sleeps at 15 min; Supabase Free pauses after 7 days idle (wake it the day before).
- Never put the Supabase **service-role key** in the mobile app or any `NEXT_PUBLIC_*` variable.
