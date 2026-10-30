#!/usr/bin/env python3
"""Builds docs/diagrams/*.svg (standalone) and inline/*.svg (theme-variable version for the published page).
   python3 build_diagrams.py        (needs example-packet.json: `pnpm --filter @najda/detector exec tsx scripts/example-packet.ts > docs/diagrams/example-packet.json`)
Figure 07 is drawn from the same half-sine model the detector tests use (docs/13 §2.1)."""
import json, math, pathlib
from dg import Svg, LIGHT, INLINE, SANS, MONO

HERE = pathlib.Path(__file__).parent
PKT = json.load(open(HERE / 'example-packet.json'))

# ------------------------------------------------------------------ 01 system architecture
def d01(T, uid):
    s = Svg(T, 1040, 612, uid, 'Sellekni system architecture',
            'Sources send one packet over HTTPS or SMS to a server that decodes, scores, merges and ranks; humans decide at the dispatcher, hospital and crew; the real emergency call is never replaced.')
    for x, t in ((24, 'SOURCES'), (268, 'CHANNELS'), (504, 'SERVER (AUTHORITATIVE)'), (816, 'PEOPLE')):
        s.text(x, 30, t, 11, fill=T.muted, weight=600, ls=1.2)
    src = [(48, "Driver's phone", 'auto-detect, then a 30 s countdown · tag SA'), (148, 'Witness', '5 taps · app or web link · no account · tag SW'), (248, 'Manual SOS', 'long-press 1.5 s · tag SM')]
    for y, t, sub in src: s.node(24, y, 200, 84, t, sub)
    # bus
    for y in (90, 190, 290): s.line(224, y, 246, y, T.ink, 1.3)
    s.line(246, 90, 246, 290, T.ink, 1.3)
    s.arrow([(246, 108), (268, 108)]); s.arrow([(246, 228), (268, 228)])
    s.node(268, 62, 190, 76, 'HTTPS · JSON', 'first choice, full detail')
    s.node(268, 190, 190, 76, 'SMS · ≤160 chars', 'GSM-7 only; works with data off')
    s.node(268, 298, 190, 66, 'Gateway phone', 'SMS-gateway app, then webhook', kind='dashed')
    s.arrow([(363, 266), (363, 298)])
    s.arrow([(458, 100), (504, 100)]); s.label(481, 92, 'POST', 10)
    s.arrow([(458, 331), (504, 331)]); s.label(481, 323, 'hook', 10)
    # server container
    s.rect(504, 48, 260, 372, T.surface, T.ink, 1.3)
    steps = [('decode + CRC', 'bad input is stored raw, never dropped'), ('assess()', 'band · score · confidence · top-3 reasons'),
             ('merge duplicates', 'N reports → higher confidence'), ('rank hospitals', 'capability × road ETA × status')]
    for i, (t, sub) in enumerate(steps):
        y = 64 + i * 72
        s.node(520, y, 228, 56, t, sub, kind='soft', size=13, subsize=10.5)
        if i < 3: s.arrow([(634, y + 56), (634, y + 72)], stroke=T.brand, sw=1.3)
    s.text(520, 372, 'audit log · who · what · why · when', 11, fill=T.muted, mono=False)
    s.text(520, 392, 'live pins to the dashboard (Realtime)', 11, fill=T.muted)
    # people
    s.node(816, 48, 200, 104, 'Dispatcher', 'web dashboard: acknowledge · dispatch · override (a reason is required)')
    s.badge(996, 66)
    s.node(816, 184, 200, 84, 'Hospital ED', 'pre-alert card + SMS · ACK · status OK/BUSY')
    s.badge(996, 202)
    s.node(816, 300, 200, 84, 'Ambulance crew', '/crew link: GCS, SBP, SpO₂ → server re-scores')
    s.badge(996, 318)
    s.arrow([(764, 100), (816, 100)]); s.label(790, 92, 'pins', 10)
    s.arrow([(916, 152), (916, 184)]); s.label(953, 172, 'pre-alert (click)', 10)
    s.arrow([(816, 238), (764, 238)]); s.label(790, 230, 'ACK', 10)
    s.arrow([(816, 352), (764, 352)]); s.label(790, 344, 'vitals', 10)
    # the call that always happens
    s.line(24, 452, 1016, 452, T.line, 1)
    s.text(24, 476, 'THE CALL THAT ALWAYS HAPPENS', 11, fill=T.muted, weight=600, ls=1.2)
    s.node(24, 490, 220, 70, "Driver's phone", 'the app opens the dialler on 14 / 1021', kind='dashed')
    s.arrow([(244, 525), (332, 525)], dash='6 4'); s.label(288, 517, 'user presses call', 10)
    s.node(332, 490, 300, 70, 'Voice call: 14 · 1021 · 1055 · 17', 'a human at Protection civile / SAMU answers', kind='dashed')
    s.arrow([(632, 525), (720, 525)], dash='6 4')
    s.node(720, 490, 296, 70, 'The same operations room', 'the call is never replaced · nothing is dispatched automatically', kind='dashed')
    s.badge(34, 590); s.text(50, 594, 'human decision point', 11, fill=T.muted)
    s.line(214, 590, 244, 590, T.muted, 1.3, dash='6 4'); s.text(252, 594, 'voice call', 11, fill=T.muted)
    return s

# ------------------------------------------------------------------ 07 saturation (to scale, from the half-sine model)
def d07(T, uid):
    s = Svg(T, 1000, 560, uid, 'What a phone accelerometer sees in a crash',
            'A 32 g half-sine crash pulse lasting 62 ms is clipped flat by a plus or minus 16 g sensor for 43 ms and by a plus or minus 8 g sensor for 53 ms, while a 6 g pothole lasting 20 ms never reaches either ceiling.')
    peak, Tms = 32.0, 62.5
    X0, X1, Y0, Y1 = 84, 770, 470, 96             # plot box (pixels); y grows downward
    tmax, gmax = 110.0, 36.0
    fx = lambda t: X0 + (X1 - X0) * t / tmax
    fy = lambda g: Y0 - (Y0 - Y1) * g / gmax
    s.text(24, 30, 'One crash, three views', 15, weight=600)
    s.text(24, 50, 'Frontal impact, Δv 45 km/h, modelled as a half-sine pulse (docs/13 §2.1). Same time axis, same scale.', 12, fill=T.muted)
    # legend
    lx = 24
    for col, dash, sw, txt in ((T.muted, '3 4', 1.6, 'what the vehicle felt'), (T.brand, None, 2.6, 'what a ±16 g phone reports'), (T.ink, None, 2.2, 'what a ±8 g phone reports')):
        s.line(lx, 74, lx + 30, 74, col, sw, dash=dash); s.text(lx + 38, 78, txt, 12, fill=T.ink); lx += 38 + len(txt) * 6.4 + 30
    for g in range(0, 37, 8):
        s.line(X0, fy(g), X1, fy(g), T.line, 0.8 if g else 1.2)
        s.text(X0 - 10, fy(g) + 4, str(g), 11, fill=T.muted, anchor='end')
    for t in range(0, 111, 20):
        s.line(fx(t), Y0, fx(t), Y0 + 5, T.muted, 1)
        s.text(fx(t), Y0 + 20, str(t), 11, fill=T.muted, anchor='middle')
    s.text((X0 + X1) / 2, Y0 + 44, 'time since impact (ms)', 12, fill=T.muted, anchor='middle')
    s.add(f'<text transform="translate(26 {(Y0 + Y1) / 2}) rotate(-90)" text-anchor="middle" font-family="{SANS}" font-size="12" style="fill:{T.muted}">acceleration (g)</text>')
    def curve(fn, t0, t1, n=140):
        return [(fx(t0 + (t1 - t0) * i / n), fy(fn(t0 + (t1 - t0) * i / n))) for i in range(n + 1)]
    def path(pts, col, sw, dash=None):
        d = ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        s.add(f'<path d="M{d}" fill="none" style="stroke:{col};stroke-width:{sw};stroke-linejoin:round;stroke-dasharray:{dash or "none"}"/>')
    pulse = lambda t: peak * math.sin(math.pi * t / Tms) if 0 <= t <= Tms else 0
    for R, col in ((16, T.brand), (8, T.ink)):
        lim = 0.95 * R
        s.line(X0, fy(lim), X1, fy(lim), col, 1.1, dash='6 4')
        s.text(X1 + 12, fy(lim) - 2, f'ceiling of a ±{R} g sensor', 12, fill=(T.brand_text if R == 16 else T.ink), weight=600)
        s.text(X1 + 12, fy(lim) + 14, f'{lim:.1f} g = 0.95 × range', 11, fill=T.muted)
    path(curve(pulse, 0, Tms), T.muted, 1.6, '3 4')
    path(curve(lambda t: min(pulse(t), 15.2), 0, Tms), T.brand, 2.6)
    path(curve(lambda t: min(pulse(t), 7.6), 0, Tms), T.ink, 2.2)
    path(curve(lambda t: 6 * math.sin(math.pi * (t - 80) / 20) if 80 <= t <= 100 else 0, 68, 108, 80), T.ink, 2.2)
    def tsat(R): return Tms * (math.pi - 2 * math.asin(0.95 * R / peak)) / math.pi
    for R, col, tcol in ((16, T.brand, T.brand_text), (8, T.ink, T.ink)):
        ts = tsat(R); a = (Tms - ts) / 2; b = a + ts
        yb = fy(0.95 * R) + 18
        s.line(fx(a), yb, fx(b), yb, col, 1.6); s.line(fx(a), yb - 5, fx(a), yb + 5, col, 1.6); s.line(fx(b), yb - 5, fx(b), yb + 5, col, 1.6)
        s.text(fx(Tms / 2), yb + 20, f'{ts:.0f} ms at the ceiling', 12, fill=tcol, anchor='middle', weight=600)
    s.text(fx(Tms / 2), fy(peak) - 12, 'true pulse: 32 g peak, 62 ms', 12, fill=T.muted, anchor='middle')
    s.text(X1 + 12, fy(3.4), 'pothole: 6 g for 20 ms', 12, fill=T.ink, weight=600)
    s.text(X1 + 12, fy(3.4) + 16, 'never reaches either ceiling', 11, fill=T.muted)
    s.line(fx(100) + 6, fy(3), X1 + 6, fy(3), T.muted, 1)
    s.text(24, 536, 'The phone cannot say how hard the crash was. It can say how long it stayed pinned at its ceiling, and a pothole never gets there.', 12, fill=T.ink)
    return s

def bullets(s, x, y, w, items, size=11.5, lh=15, gap=5, fill=None):
    for it in items:
        ls = __import__('dg').wrap(it, w - 12, size)
        s.text(x, y, '•', size, fill=s.T.muted)
        for i, l in enumerate(ls):
            s.text(x + 12, y, l, size, fill=fill or s.T.ink); y += lh
        y += gap
    return y

# ------------------------------------------------------------------ 02 hero-flow sequence
def d02(T, uid):
    s = Svg(T, 1040, 712, uid, 'Hero flow: from impact to a ready hospital',
            'Sequence of messages in the 90-second demo: the driver phone detects the crash and sends an SMS through the gateway phone to the server, which scores it and shows a pin to the dispatcher; a witness report merges into it; the dispatcher decides, sends a pre-alert to the hospital, the hospital acknowledges, and the driver sees received.')
    W = __import__('dg').wrap
    X = {'drv': 118, 'wit': 268, 'gw': 408, 'srv': 566, 'dis': 742, 'hos': 925}
    names = {'drv': ("Driver's phone", 'replay mode'), 'wit': ('Witness', '5 taps'), 'gw': ('Gateway phone', 'SMS in'), 'srv': ('Server', 'authoritative'), 'dis': ('Dispatcher', 'dashboard'), 'hos': ('Hospital ED', 'view + SMS')}
    for k, x in X.items():
        s.node(x - 62, 14, 124, 52, names[k][0], names[k][1], size=12.5, subsize=10.5, kind=('soft' if k == 'srv' else 'solid'))
        s.line(x, 66, x, 696, T.line, 1.2, dash='4 5')
    s.label(16, 90, 'REPLAY · SYNTHETIC trace on the driver phone, mobile data OFF', 11, anchor='start')
    def note(k, y, n, text, human=False, w=190, x0=None):
        x = X[k]; ls = W(text, w - 40, 11.5); h = 22 + 15 * (len(ls) - 1) + 10
        left = x - w / 2 if x0 is None else x0
        s.rect(left, y, w, h, T.brand_soft if human else T.surface, T.brand if human else T.ink, 1.2, 6)
        s.text(left + 12, y + 18, str(n), 11.5, fill=T.brand_text if human else T.muted, weight=700)
        s.lines(left + 28, y + 18, ls, 11.5, 15)
        return y + h
    def msg(a, b, y, n, text, dash=None, col=None):
        xa, xb = X[a], X[b]
        s.arrow([(xa, y), (xb, y)], stroke=col, dash=dash)
        s.label((xa + xb) / 2, y - 7, f'{n}  {text}', 11.5, fill=T.ink)
    note('drv', 104, 1, 'impact, 8 s check, 30 s countdown (10 s in demo, labelled)', w=214, x0=16)
    note('drv', 176, 2, 'dialler opens on 14; the real call still happens', w=214, x0=16)
    msg('drv', 'gw', 268, 3, 'SMS  SLK1 … #CRC')
    msg('gw', 'srv', 304, 4, 'webhook')
    note('srv', 322, 5, 'decode · CRC · assess() · store')
    msg('srv', 'dis', 398, 6, 'pin on the map: band, score, reasons')
    msg('wit', 'srv', 440, 7, '5-tap report over HTTPS')
    note('srv', 458, 8, 'merge: 2 reports, confidence up')
    note('dis', 526, 9, 'acknowledge, then dispatch (a human click, logged)', human=True, w=230)
    msg('dis', 'hos', 606, 10, 'pre-alert (click): card + SMS')
    msg('hos', 'dis', 644, 11, 'ACK', dash='5 4')
    msg('srv', 'drv', 684, 12, 'delivered: "received by rescuers"', dash='5 4')
    return s

# ------------------------------------------------------------------ 03 detector pipeline
def d03(T, uid):
    s = Svg(T, 1040, 640, uid, 'Phone crash detector: states and the four gates',
            'The detector moves from idle to armed when GPS speed stays above 25 km/h, opens an event on a range-capped dynamic acceleration of 4 g, judges it eight seconds later, and alerts only if all four gates pass; each gate rejects a specific false-alarm scenario.')
    s.text(24, 28, 'STATES', 11, fill=T.muted, weight=600, ls=1.2)
    s.node(24, 44, 120, 56, 'IDLE', 'not driving', size=13)
    s.node(262, 44, 120, 56, 'ARMED', 'watching', kind='soft', size=13)
    s.node(520, 44, 190, 56, 'EVALUATING', 'event open, judged at +8 s', kind='soft', size=13)
    s.node(846, 44, 170, 56, 'ALERT', 'app runs the countdown', size=13)
    s.arrow([(144, 64), (262, 64)]); s.label(203, 56, 'GPS ≥ 25 km/h, 10 s', 10.5)
    s.arrow([(262, 88), (144, 88)], dash='5 4'); s.label(203, 108, '< 10 km/h for 3 min', 10.5)
    s.arrow([(382, 72), (520, 72)]); s.label(451, 64, 'dynamic accel ≥ 4 g*', 10.5)
    s.arrow([(710, 72), (846, 72)], stroke=T.brand); s.label(778, 64, 'rule a, b or c', 10.5, fill=T.brand_text)
    s.label(778, 94, 'AND it stopped', 10.5, fill=T.brand_text)
    s.node(520, 176, 190, 48, 'REJECTED', 'logged for the Sensor Lab', kind='ghost', size=12.5, subsize=10.5)
    s.arrow([(615, 100), (615, 176)], dash='5 4'); s.label(662, 160, 'otherwise', 10.5)
    s.arrow([(520, 200), (322, 200), (322, 100)], dash='5 4')
    s.arrow([(931, 100), (931, 130), (322, 130)], head=False, dash='5 4'); 
    s.label(760, 130, 'acknowledge()', 10.5)
    s.text(24, 284, '* min(4 g, 0.95 × range − 1 g): thresholds follow the sensor range.', 11, fill=T.muted)
    s.node(24, 150, 230, 46, 'Range below ±8 g: UNSUPPORTED', 'SOS and witness only, and say why', kind='dashed', size=11.5, subsize=10.5)
    s.node(24, 204, 230, 46, 'Rate below 45 Hz: rateOk = false', 'warn: detection unreliable', kind='dashed', size=11.5, subsize=10.5)
    s.line(24, 296, 1016, 296, T.line, 1)
    s.text(24, 314, 'FOUR GATES EVERY ALERT MUST PASS, AND THE FALSE ALARM EACH ONE STOPS', 11, fill=T.muted, weight=600, ls=1.2)
    s.text(24, 332, 'The tests switch each gate off in turn: that trap then alerts, so none of them is decoration (docs/13 §4).', 12, fill=T.muted)
    rows = [('Armed above 25 km/h for 10 s', 'door slam · phone in a pocket while walking · parked car', 'known limit: a 12 km/h shunt is not detected'),
            ('Sustained impact: ≥ 30 ms above min(2.5 g, 0.95 × range − 1)', 'pothole 6 g / 20 ms · pothole, then braking to a red light', 'time spent at the sensor ceiling counts'),
            ('Speed collapse from GPS: ≥ 20 km/h (≥ 10 with an 8 g hit)', 'phone dropped in a moving car · hard brake with no impact', 'Δv never comes from a clipped accelerometer'),
            ('Came to a stop: below 5 km/h within 8 s', 'brake, then a hard speed bump (the car keeps moving)', '8 s = 5 s + GPS lag budget (assumed 0.8 s, measure it)')]
    for i, (g, trap, note) in enumerate(rows):
        y = 350 + i * 70
        s.node(24, y, 440, 58, g, note, kind='soft', size=12.5, subsize=10.5)
        s.arrow([(464, y + 29), (516, y + 29)], stroke=T.brand); s.label(490, y + 21, 'stops', 10, fill=T.brand_text)
        s.node(516, y, 500, 58, trap, None, kind='solid', size=12.5)
        s.text(528, y + 44, 'rejected in the replay tests', 10.5, fill=T.muted)
    return s

# ------------------------------------------------------------------ 04 sources -> one packet
def d04(T, uid):
    wire = PKT['wire']
    s = Svg(T, 1040, 640, uid, 'Every source ends in the same packet',
            'Phone, witness and manual SOS produce the same SLK1 packet today; a plug-in box and an OBD link would fill the same fields later. The server decodes, recomputes and merges whatever arrives.')
    s.text(24, 28, 'SOURCES', 11, fill=T.muted, weight=600, ls=1.2)
    src = [('Driver\'s phone', 'accelerometer, gyro, GPS · tag SA', 'solid'), ('Witness', '5 taps, no sensors · tag SW', 'solid'), ('Manual SOS', 'long-press · tag SM', 'solid'),
           ('Plug-in box', 'ROADMAP · ±200 g sensor · tag SD (v1.1)', 'dashed'), ('OBD link', 'ROADMAP · wheel speed for Δv', 'dashed')]
    ys = []
    for i, (t, sub, k) in enumerate(src):
        y = 44 + i * 92; ys.append(y + 36)
        s.node(24, y, 206, 72, t, sub, kind=k)
    # packet panel
    px, py, pw = 262, 44, 560
    s.rect(px, py, pw, 462, T.surface, T.ink, 1.3)
    s.text(px + 14, py + 24, 'ONE PACKET, ≤ 160 GSM-7 characters', 11, fill=T.muted, weight=600, ls=1.2)
    s.text(px + 14, py + 50, wire, 11.5, mono=True)
    s.text(px + 14, py + 68, f"real output: detector decision → toPacketHints → encodeDzmsd ({len(wire)} chars)", 10.5, fill=T.muted)
    toks = wire.split(' ')
    band = toks[2]; coords = toks[3]
    rows = [('SLK1 K7Q2M', 'magic + 5-char id', 'id makes retries harmless'),
            (band, 'band · score · confidence', 'a hint: the server recomputes it'),
            (coords, 'position, 5 decimals', 'GPS fix'),
            ('T1432 SA V1 P1 KC', 'time · source · vehicles · persons · kind', 'SA / SW / SM today'),
            ('D45', 'speed drop in km/h', 'phone: GPS · OBD: wheel speed (roadmap)'),
            ('G16', 'peak g', 'phone: min(peak, range) · box: to 200 g (roadmap)'),
            ('FN', 'flag: no response to the countdown', 'the human gate'),
            (toks[-2], 'Plus Code for the verbal relay', 'GPS fix'),
            (toks[-1], 'CRC-8', 'integrity, not authentication')]
    y = py + 98
    s.text(px + 14, y - 8, 'TOKEN', 10, fill=T.muted, weight=600, ls=1); s.text(px + 200, y - 8, 'MEANS', 10, fill=T.muted, weight=600, ls=1); s.text(px + 390, y - 8, 'FILLED BY', 10, fill=T.muted, weight=600, ls=1)
    for i, (tk, mean, who) in enumerate(rows):
        yy = y + i * 40
        s.line(px + 14, yy - 2, px + pw - 14, yy - 2, T.line, 0.8)
        s.text(px + 14, yy + 18, tk, 12, mono=True, weight=600, fill=T.brand_text)
        s.lines(px + 200, yy + 16, __import__('dg').wrap(mean, 170, 11.5), 11.5, 14)
        s.lines(px + 390, yy + 16, __import__('dg').wrap(who, 158, 11), 11, 13, fill=T.muted)
    # arrows from sources into the panel
    for (yc, (t, sub, k)) in zip(ys, src):
        s.arrow([(230, yc), (262, yc)], stroke=T.muted if k == 'dashed' else T.ink, dash='5 4' if k == 'dashed' else None)
    # right: channels and server
    s.text(850, 28, 'THEN', 11, fill=T.muted, weight=600, ls=1.2)
    s.node(850, 44, 166, 70, 'HTTPS or SMS', 'same bytes either way')
    s.arrow([(822, 79), (850, 79)])
    s.arrow([(933, 114), (933, 150)])
    s.node(850, 150, 166, 120, 'Server', 'one decoder for every source: CRC, assess(), merge, rank', kind='soft')
    s.arrow([(933, 270), (933, 306)])
    s.node(850, 306, 166, 70, 'People decide', 'dispatcher · hospital · crew')
    s.badge(996, 324)
    s.rect(24, 524, 992, 96, T.brand_soft, T.brand, 1.2, 8)
    s.text(40, 548, 'Adding a source never changes the server.', 13, weight=600, fill=T.brand_text)
    s.para(40, 568, 'A box needs one new source letter and "G may exceed the phone range": protocol v1.1, changed only through the najda-protocol procedure (docs 12 and 16). '
           f"The band {band[0]} {band[1:3]} {band[3]} above is what the server computed for this phone-only reading: mechanism evidence alone is capped, more reports or vitals raise it.", 950, 12, 16, fill=T.ink)
    return s

# ------------------------------------------------------------------ 05 box blocks (roadmap)
def d05(T, uid):
    s = Svg(T, 1040, 640, uid, 'Roadmap: plug-in crash box, block diagram',
            'Block diagram of a future plug-in box: vehicle power through surge protection and a buck converter to an ESP32-class MCU, a plus or minus 200 g accelerometer, a six-axis IMU, an LTE and GNSS modem with SIM, a cancel button and buzzer, an optional CAN link, and a backup supercapacitor; it sends the same packet to the same server. Roadmap only, not built.')
    s.rect(160, 56, 640, 372, 'none', T.muted, 1.4, 12, dash='7 5')
    s.text(176, 78, 'BOX · ROADMAP · NOT BUILT', 11, fill=T.muted, weight=600, ls=1.2)
    s.node(24, 150, 112, 70, '12 / 24 V', 'OBD pin 16 or a fuse tap', size=12.5, subsize=10.5)
    s.node(184, 140, 160, 90, 'Surge guard + buck', '5 V / 3.3 V, load-dump safe', size=12, subsize=10.5)
    s.node(184, 262, 160, 86, 'Backup power', 'supercap or cell: keeps the radio alive after a power cut', kind='soft', size=12, subsize=10.5)
    s.arrow([(136, 185), (184, 185)])
    s.node(392, 186, 190, 120, 'MCU (ESP32-class)', 'detector rules, packet encoder, provisioning over BLE or Wi-Fi', kind='soft', size=13)
    s.arrow([(344, 200), (392, 200)]); s.label(368, 192, 'power', 10)
    s.arrow([(344, 304), (368, 304), (368, 262), (392, 262)], dash='5 4')
    s.node(354, 92, 150, 70, 'High-g accelerometer', 'ADXL375-class, ±200 g', size=12, subsize=10.5)
    s.node(518, 92, 128, 70, '6-axis IMU', 'orientation, rollover', size=12, subsize=10.5)
    s.arrow([(429, 162), (429, 186)]); s.arrow([(566, 162), (566, 186)])
    s.node(340, 346, 170, 66, 'LTE modem + GNSS', 'LTE: 2G/3G retire by 2029', size=12, subsize=10.5)
    s.node(526, 346, 110, 66, 'SIM', 'nano-SIM, credit', size=12, subsize=10.5)
    s.arrow([(450, 306), (450, 346)]); s.arrow([(526, 379), (510, 379)], head=True)
    s.node(640, 186, 148, 60, 'Cancel button + buzzer', "the human gate", size=11.5, subsize=10.5)
    s.node(640, 262, 148, 60, 'CAN / OBD (optional)', 'wheel speed for Δv', kind='dashed', size=11.5, subsize=10.5)
    s.arrow([(582, 216), (640, 216)]); s.arrow([(582, 292), (640, 292)], dash='5 4')
    s.arrow([(425, 412), (425, 470)], stroke=T.brand); s.label(500, 450, 'same packet · HTTPS first, SMS fallback', 11, fill=T.brand_text)
    s.node(300, 470, 330, 56, 'The same server', 'it cannot tell the box from a phone', kind='soft', size=13)
    s.text(824, 78, 'WHY IT EXISTS', 11, fill=T.muted, weight=600, ls=1.2)
    s.para(824, 98, 'A ±200 g sensor sees the real crash pulse (36–46 g, about 100 ms in published full-frontal tests). G becomes a measurement and Δv can be integrated; the phone must use GPS for Δv.', 192, 12, 16)
    s.text(824, 226, 'ACCEPTANCE TEST', 11, fill=T.muted, weight=600, ls=1.2)
    s.para(824, 246, 'Port the encoder to C and reproduce the 302 valid and 134 invalid golden vectors byte for byte.', 192, 12, 16)
    s.text(824, 328, 'BEFORE A PRODUCT', 11, fill=T.muted, weight=600, ls=1.2)
    s.para(824, 348, 'Decree 26-97 homologation, GSMA TAC, automotive EMC, operator LTE band check.', 192, 12, 16)
    s.line(24, 556, 1016, 556, T.line, 1)
    s.text(24, 578, 'FIRMWARE FLOW', 11, fill=T.muted, weight=600, ls=1.2)
    chips = ['sample at the part’s max rate', 'ring buffer', 'trigger ≥ 4 g', 'gates: speed, duration, stop', 'countdown + button', 'encode (C port)', 'send']
    x = 24; w = 134
    for i, c in enumerate(chips):
        s.rect(x, 590, w - 12, 36, T.surface, T.ink, 1.1, 6)
        ls = __import__('dg').wrap(c, w - 28, 10.5)
        s.lines(x + (w - 12) / 2, 606 if len(ls) == 1 else 602, ls, 10.5, 12, anchor='middle')
        if i < len(chips) - 1: s.arrow([(x + w - 12, 608), (x + w + 2, 608)], sw=1.2)
        x += w + 8
    return s

# ------------------------------------------------------------------ 06 business model canvas
def d06(T, uid):
    s = Svg(T, 1040, 730, uid, 'Sellekni Business Model Canvas',
            'Nine-block canvas: partners, activities, resources, value propositions, relationships, channels, segments, cost structure and revenue streams, plus an impact-metrics strip. Everything about payers and prices is a hypothesis to test.')
    def block(x, y, w, h, en, fr, items, soft=False):
        s.rect(x, y, w, h, T.brand_soft if soft else T.surface, T.brand if soft else T.ink, 1.3, 8)
        s.text(x + 12, y + 22, en, 12.5, weight=700, fill=T.brand_text if soft else T.ink)
        s.text(x + 12, y + 38, fr, 10.5, fill=T.muted, italic=True)
        bullets(s, x + 12, y + 60, w - 24, items, 11.5, 15, 4)
    s.text(20, 28, 'Business Model Canvas · hypotheses to validate, nothing here is a verified price or a verified payer', 12, fill=T.muted)
    block(20, 44, 200, 424, 'Key partners', 'Partenaires clés', ['Protection civile / SAMU: operators and ground truth', 'Hospitals and the health ministry', 'DNSR: data and campaigns', 'Telecom operators: SMS, coverage data', 'Emergency physicians, universities: clinical review', 'Incubators and the startup-label committee'])
    block(220, 44, 200, 212, 'Key activities', 'Activités clés', ['Build the app and the dashboard', 'Collect real driving traces, retune the detector', 'Verify hospital data', 'Clinical review, operator training', 'Privacy and legal work'])
    block(220, 256, 200, 212, 'Key resources', 'Ressources clés', ['Tested protocol + scoring package', 'Detector + replay traces', 'Design system', 'Hospital registry (to build, to verify)', 'Clinician and operator relationships'])
    block(420, 44, 200, 424, 'Value propositions', 'Propositions de valeur', ['Sender: if I cannot call, my phone does, and I stay in control', 'Operator: one merged, located report with an explainable severity estimate and a hospital recommendation', 'Hospital: a pre-alert with mechanism and ETA', 'Works when data is weak (SMS)', 'Complements 14 / 1021; humans decide'], soft=True)
    block(620, 44, 200, 212, 'Customer relationships', 'Relations clients', ['Co-design with a few operators', 'Operator training day', 'False-alarm feedback loop', '"Received" confirmation for senders'])
    block(620, 256, 200, 212, 'Channels', 'Canaux', ['Pilot: sideloaded APK + web links', 'App store later (SEND_SMS is Play-restricted)', 'Operator training days', 'Driving schools, campuses, fleets'])
    block(820, 44, 200, 424, 'Customer segments', 'Segments de clientèle', ['Senders (free): drivers, passengers, witnesses', 'Receivers: operations rooms, hospital EDs (free in the pilot, payer to find)', 'Possible payers (to test): fleets, insurers (motor is 41.6% of 2024 premiums), road authorities'])
    block(20, 480, 500, 150, 'Cost structure', 'Structure de coûts', ['Team time (the main cost) · cloud: free tiers now, paid at pilot scale', 'SMS gateway SIMs and messages · map and route hosting', 'Clinician and legal review · trademark and domain checks · test devices', 'Hardware and homologation: roadmap only'])
    block(520, 480, 500, 150, 'Revenue streams', 'Sources de revenus', ['Today: none. To test, in order: (1) non-dilutive funding: prizes, incubators, Algeria Startup Fund after labelling', '(2) institutional licence or support, price after interviews · (3) fleet or insurer subscription · (4) anonymised black-spot analytics, needs a legal basis. No price is claimed.'])
    s.rect(20, 642, 1000, 72, 'none', T.brand, 1.3, 8, dash='6 4')
    s.text(32, 664, 'Impact: how we will know it works (pilot metrics, measured, never claimed in advance)', 12.5, weight=700, fill=T.brand_text)
    s.para(32, 684, 'Median and p90 time from impact to a located report on the operator screen · share of reports located within X m · duplicates merged · false alarms per 100 driving hours · operator trust · hospital pre-alert acknowledgements', 976, 11.5, 15)
    return s

BUILD = {'01-system-architecture': d01, '02-hero-flow-sequence': d02, '03-detector-pipeline': d03, '04-sources-to-packet': d04,
         '05-roadmap-box-blocks': d05, '06-bmc': d06, '07-saturation': d07}

if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    (HERE / 'inline').mkdir(exist_ok=True)
    for name, fn in BUILD.items():
        if only and not any(o in name for o in only): continue
        uid = 'f' + name[:2]
        (HERE / f'{name}.svg').write_text(fn(LIGHT, uid).render(True), encoding='utf-8')
        (HERE / 'inline' / f'{name}.svg').write_text(fn(INLINE, uid).render(False), encoding='utf-8')
        print('built', name)
