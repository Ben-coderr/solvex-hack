# G4 drill — SMS only, mobile data off (due H15)

**Pass =** with Wi-Fi and mobile data OFF on the Realme, a replayed crash reaches the dashboard as a pin **by real SMS through the gateway phone**, the driver phone gets the ACK SMS, and the whole thing is screen-recorded. Then 10 timed runs → `data/metrics/latency.csv`.

Status at 00:41 Sat: the app side works up to the radio (DECISIONS [24h-H2]: GW1 → GW2 sent, both `failed 124` = **no SIM credit**). Nothing below needs new code.

## 0. Blockers — solve these first
- [ ] **SIM credit on the Realme** (the SIM chosen in Settings → SIM for SMS; last time SIM 1 Ooredoo was default) — ~20 SMS.
- [ ] **SIM credit on the gateway phone** — it sends the ACK SMS back (one per alert).
- [ ] **Signal ≥ 3 bars** on both phones in the room where you will pitch. Pick the operator that works there.

## 1. The webhook must be HTTPS — or 127.0.0.1 over USB (this changes docs/08)
The gateway app only POSTs webhooks to **HTTPS with a valid certificate**; plain HTTP is accepted only for `http://127.0.0.1` (docs.sms-gate.app/features/webhooks, checked 2026-10-31). `http://<laptop-ip>:3000/api/sms/inbound` **will not work**.

**Chosen: gateway phone on USB to the laptop** — nothing public, no Wi-Fi needed:
```sh
adb -s <gateway-serial> reverse tcp:3000 tcp:3000   # phone's 127.0.0.1:3000 → laptop's :3000 (webhook)
adb -s <gateway-serial> forward tcp:8080 tcp:8080   # laptop's 127.0.0.1:8080 → gateway's local server (ACK SMS)
```
Then webhook URL = `http://127.0.0.1:3000/api/sms/inbound` and `SMSGATE_BASE_URL=http://127.0.0.1:8080`. Re-run both `adb` lines after any replug. The gateway phone stays cabled on the table.

Fallback: a Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3000`, URL changes on every restart; exposes the laptop publicly while it runs).

## 2. Gateway phone (any Android with a SIM)
1. Install **SMS Gateway for Android** (capcom6). Turn on **Local Server**; note the IP, port (8080), username and password it shows.
2. Settings → Webhooks → **Signing Key**: set it to the same value as `SMSGATE_WEBHOOK_SECRET` in `.env.local`.
3. Battery: no optimisation for the gateway app; keep it charging, screen on.
4. USB cable to the laptop, then the two `adb` lines from step 1.

## 3. Laptop
1. `.env.local`: `SMSGATE_MODE=local`, `SMSGATE_BASE_URL=http://127.0.0.1:8080`, `SMSGATE_USER` / `SMSGATE_PASSWORD` from step 2.1. Optional: `SMSGATE_CAPTURE_DIR=../../data/captures` to record the real payload (it confirms the `receivedAt` format, still unconfirmed in `gateway.ts`).
2. Production build on :3000 (not `next dev`, it reload-loops here). Status strip must **not** say *SMS gateway: simulated*.
3. Register the webhook on the gateway phone (Local mode keeps its own webhook list):
   ```sh
   curl -u USER:PASS -X POST http://127.0.0.1:8080/webhooks -H 'content-type: application/json' \
     -d '{"id":"sellekni","url":"http://127.0.0.1:3000/api/sms/inbound","event":"sms:received"}'
   curl -u USER:PASS http://127.0.0.1:8080/webhooks     # check it is listed
   ```
   (Body per the vendor's cloud example; the local endpoint is not spelled out in their docs — if this 404s, check the Local Server API page in the app.)
4. Smoke test before touching the Realme: from **any** phone, text the gateway number the canonical packet from `scripts/curl-demo.sh` (`EX1`). A pin must appear on the dashboard within seconds. If not: `./sellekni logs web` — a `401 webhook signature mismatch` means the signing key differs; `stale` means the phone clock is off by > 5 min.

## 4. Realme
1. Settings → GW1 = gateway phone number (`+213…`), GW2 = blank or a second gateway; SIM for SMS = the SIM with credit.
2. Wi-Fi **off**, mobile data **off** (airplane mode, then turn only the cellular radio back on if needed — check the SIM still has service).
3. Start screen recording (and `scrcpy` on the laptop if it is the stage setup).
4. Replay `frontal_45_r16` → countdown → let it run out.
5. Expected: banner **SMS only** → status row *SMS GW1 sent* → pin on the dashboard → ACK SMS arrives on the Realme → status *received*.

## 5. Record 10 runs → `data/metrics/latency.csv`
```
run,scenario,channel,sim,sent_at,webhook_at,pin_at,ack_sms_at,result,note
1,frontal_45_r16,sms,ooredoo,14:32:07,14:32:13,14:32:14,14:32:21,ok,
```
`sent_at` from the Realme status row, `webhook_at`/`pin_at` from the incident's audit entry, `ack_sms_at` from the Realme's SMS app. Quote these only as **"in our test, N=10"**.

## 6. If it fails on stage (docs/10 §5 ladder) — say it out loud
1. SMS does not arrive within ~20 s → dashboard **Simulate SMS** (DEMO_MODE) with the same packet: *"this is the same 77-character packet, injected — the real SMS is in our video."*
2. Webhook down (cable/adb reverse lost) → read the SMS on the gateway phone's screen, **Paste SMS** on the dashboard: same ingest path.
3. Everything down → the recorded video of this drill.

## 7. After it passes
- [ ] Video saved to the desktop **and** a USB stick.
- [ ] One line in DECISIONS.md: date, time, SIM, median latency, the payload capture confirmed (or not).
- [ ] Commit `data/metrics/latency.csv` and any new fixture from `data/captures` (strip phone numbers first).
