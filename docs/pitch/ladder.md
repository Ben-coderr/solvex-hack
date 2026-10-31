# Resilience ladder — print, tape next to the laptop

**Rule:** never debug live. When a trigger fires, say the line and step down **at the same demo step** (docs/10 §3, steps 1–11).
Going down is a plan, not a failure. Say "DEMO" and "REPLAY" out loud whenever they're on screen.

| Rung | What runs | Step down when (trigger) | Say | How (≤ 10 s) |
|---|---|---|---|---|
| **1 · Real SMS** | Phone A replays `rollover_71`, data OFF → real SMS → gateway phone → dashboard | SMS not on the gateway phone screen **20 s** after "No response, sending help" · **or** it is on the phone but no pin after **5 s** · **or** `reset-demo.sh` said "gateway phone not reachable" | "The SMS network is slow in this room. Same packet, same code — injected." | If the SMS is on the gateway screen: dashboard **Paste SMS**, type/paste it. Otherwise **Simulate SMS → Rollover**. |
| **2 · Simulate SMS** | Dashboard **Simulate SMS** (DEMO_MODE): same ingest code, channel `sim`, labelled DEMO | Dashboard does not answer a click in **5 s** · strip says Offline · the page errors | "Let me show it from the driver's phone instead." | Phone A: data ON, replay `rollover_71` again. |
| **3 · Replay over the internet path** | Phone A replay, mobile data ON: the alert goes over HTTP to the server in the app's Settings (laptop on the hotspot; HTTPS to the Vercel backup if the laptop is gone, runbook.md) | No pin **5 s** after the phone shows "sent" · laptop frozen · projector lost the laptop | "Here is the recorded run of exactly this." | Open `docs/pitch/videos/` (desktop copy) → the clip with the current step number (01…11). |
| **4 · Recorded video** | Clip `NN-….mp4`, narrated live from the same step | Video won't play (USB/laptop dead) | "The slides show what you would have seen." | Slides PDF on the USB stick, any laptop. |
| **5 · Slides** | Screenshots in the deck | — | — | — |

**Short on time?** Play `00-cut-60s.mp4` (the 60-second cut) and go straight to "What we measured".

## Before going on stage (T-10 min)
- [ ] `scripts/reset-demo.sh --prod` → **READY**, every line green (gateway line may be yellow only if we already agreed to start at rung 2)
- [ ] Gateway phone: plugged in, screen on, SMS Gateway message list cleared, bars ≥ 3
- [ ] Phone A: replay `rollover_71` loaded, data ON (we switch it off on stage), outbox empty
- [ ] Dashboard, hospital view, /demo, /phones open (`./sellekni open`)
- [ ] Videos on the desktop **and** the USB stick; slides PDF on the USB stick
- [ ] Cloud backup awake: open the Vercel URL and log in once (runbook.md)

**Laptop dead?** Use `docs/pitch/runbook.md` → "Switch to backup" (another laptop or a phone, Vercel URL).
