#!/usr/bin/env python3 -I
"""
INDEPENDENT cross-check of the TypeScript codec + NSI engine.

This file re-implements the DZ-MSD v1 wire format, CRC-8 and the NSI points table straight from
docs/05-PROTOCOL-SCORING-RANKING.md (it shares NO code with src/*.ts) and verifies every golden vector.
It is also the reference you can copy into a FastAPI backend if the team prefers Python.

Run:  python3 -I scripts/crosscheck.py
Exit code 0 = all vectors agree.
"""
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
VEC = os.path.join(HERE, '..', 'test-vectors')

# ───────────── CRC-8 (poly 0x07) ─────────────
def crc8(data: bytes, poly=0x07):
    c = 0
    for b in data:
        c ^= b
        for _ in range(8):
            c = ((c << 1) ^ poly) & 0xFF if c & 0x80 else (c << 1) & 0xFF
    return c

KIND_ORDER = "CMTBPX"
FLAG_ORDER = "NUBHEDXCF"

def pick_order(items, order):
    return "".join(ch for ch in order if ch in items)

# ───────────── wire format ─────────────
def encode(p):
    t = ["NAJDA1", p["id"], f'{p["band"]}{p["score"]:02d}{p["conf"]}',
         f'{p["lat"]:.5f},{p["lon"]:.5f}'.replace("-0.00000", "0.00000"),
         f'T{p["time"]}', f'S{p["src"]}', f'V{p["veh"]}', f'P{p["pers"]}',
         "K" + pick_order(p["kinds"], KIND_ORDER)]
    if "dv" in p: t.append(f'D{p["dv"]}')
    if "g" in p: t.append(f'G{p["g"]}')
    if p.get("roll"): t.append("RO")
    if p.get("flags"): t.append("F" + pick_order(p["flags"], FLAG_ORDER))
    if "hr" in p: t.append(f'HR{p["hr"]}')
    if "spo2" in p: t.append(f'SP{p["spo2"]}')
    if p.get("plus"): t.append(p["plus"])
    body = " ".join(t)
    return f"{body} #{crc8(body.encode('ascii')):02X}"

class DecodeError(ValueError):
    pass

ID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{5}$")
PLUS_RE = re.compile(r"^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3])[0-5]\d$")

def decode(s):
    """STRICT decoder (same rules as src/dzmsd.ts). Raises DecodeError on anything invalid."""
    s = re.sub(r"\s+", " ", s.strip()).upper()
    if not s.startswith("NAJDA1 "): raise DecodeError("bad_magic")
    if " #" not in s: raise DecodeError("missing_checksum")
    body, cs = s.rsplit(" #", 1)
    if not re.fullmatch(r"[0-9A-F]{2}", cs): raise DecodeError("bad_checksum_format")
    if crc8(body.encode()) != int(cs, 16): raise DecodeError("checksum_mismatch")
    tok = body.split(" ")
    if len(tok) < 4: raise DecodeError("too_few_tokens")
    if not ID_RE.match(tok[1]): raise DecodeError("bad_id")
    m = re.fullmatch(r"([ROYGU])(\d{2})([HML])", tok[2])
    if not m: raise DecodeError("bad_assessment")
    out = {"id": tok[1], "band": m[1], "score": int(m[2]), "conf": m[3]}
    c = re.fullmatch(r"(-?\d{1,2}\.\d{5}),(-?\d{1,3}\.\d{5})", tok[3])
    if not c: raise DecodeError("bad_coordinates")
    out["lat"], out["lon"] = float(c[1]), float(c[2])
    if abs(out["lat"]) > 90 or abs(out["lon"]) > 180: raise DecodeError("out_of_range")
    seen = set()
    def once(k):
        if k in seen: raise DecodeError("duplicate_token")
        seen.add(k)
    for x in tok[4:]:
        if "+" in x:
            if not PLUS_RE.match(x): raise DecodeError("bad_pluscode")
            once("plus"); out["plus"] = x
        elif x == "RO": once("RO"); out["roll"] = True
        elif (m := re.fullmatch(r"HR(\d{1,3})", x)): once("HR"); out["hr"] = int(m[1])
        elif (m := re.fullmatch(r"SP(\d{1,3})", x)):
            once("SP")
            if int(m[1]) > 100: raise DecodeError("out_of_range")
            out["spo2"] = int(m[1])
        elif (m := re.fullmatch(r"T(\d{4})", x)):
            once("T")
            if not TIME_RE.match(m[1]): raise DecodeError("out_of_range")
            out["time"] = m[1]
        elif (m := re.fullmatch(r"S([AWM])", x)): once("S"); out["src"] = m[1]
        elif (m := re.fullmatch(r"V(\d{1,2})", x)): once("V"); out["veh"] = int(m[1])
        elif (m := re.fullmatch(r"P(\d{1,2})", x)): once("P"); out["pers"] = int(m[1])
        elif (m := re.fullmatch(r"K([CMTBPX]+)", x)):
            once("K")
            if len(set(m[1])) != len(m[1]): raise DecodeError("bad_token")
            out["kinds"] = list(pick_order(m[1], KIND_ORDER))
        elif (m := re.fullmatch(r"D(\d{1,3})", x)): once("D"); out["dv"] = int(m[1])
        elif (m := re.fullmatch(r"G(\d{1,3})", x)): once("G"); out["g"] = int(m[1])
        elif (m := re.fullmatch(r"F([NUBHEDXCF]+)", x)):
            once("F")
            if len(set(m[1])) != len(m[1]): raise DecodeError("bad_token")
            out["flags"] = list(pick_order(m[1], FLAG_ORDER))
        elif re.fullmatch(r"[A-Z]{1,2}\d*[A-Z0-9]*", x) and not re.match(r"(T|S|V|P|K|D|G|F|HR|SP)", x):
            pass  # forward-compatible unknown token: ignored (TypeScript warns)
        else:
            raise DecodeError("bad_token")
    for k in ("T", "S", "V", "P", "K"):
        if k not in seen: raise DecodeError("missing_field")
    return out

# ───────────── NSI (from the spec table, not from the TS) ─────────────
def nsi(i):
    flags = set(i.get("flags", []))
    kinds = set(i.get("kinds", []))
    physics = 0
    dv = i.get("dvKmh")
    if dv is not None: physics += 30 if dv >= 60 else 20 if dv >= 40 else 10 if dv >= 25 else 0
    if i.get("peakG", 0) >= 20: physics += 5
    if i.get("rollover"): physics += 15
    if i.get("multiImpact"): physics += 5
    physics = min(physics, 50)

    other = 0
    no_resp = bool(i.get("noResponse")) or "N" in flags
    if no_resp: other += 15
    red = []
    for f, pts, code in (("U", 25, "unresponsive"), ("B", 20, "breathing"), ("H", 20, "bleeding")):
        if f in flags: other += pts; red.append(code)
    for f, pts in (("E", 20), ("D", 20), ("X", 15), ("C", 10)):
        if f in flags: other += pts
    if "P" in kinds or "M" in kinds: other += 10
    spo2, hr, gcs, sbp = i.get("spo2"), i.get("hr"), i.get("gcs"), i.get("sbp")
    if spo2 is not None and spo2 < 90: other += 20; red.append("spo2_low")
    hr_abn = hr is not None and (hr > 130 or hr < 50)
    if hr_abn: other += 15
    if gcs is not None and gcs < 13: other += 25; red.append("gcs_low")
    if sbp is not None and sbp < 90: other += 20; red.append("sbp_low")
    if i.get("age", 0) >= 65: other += 5
    if i.get("pregnant"): other += 5
    if i.get("anticoagulant"): other += 5

    raw = physics + other
    score = min(99, max(0, int(math.floor(99 * (1 - math.exp(-raw / 60)) + 0.5))))  # round-half-up like JS
    physiological = bool(red) or no_resp or hr_abn
    if red: band = "R"
    elif score >= 70 and physiological: band = "R"
    elif score >= 70: band = "O"          # Vittel-style cap: mechanism only
    elif score >= 45: band = "O"
    elif score >= 20: band = "Y"
    else: band = "G" if i.get("confirmedOk") else "U"

    # confidence
    sensor = sum([(dv is not None and dv >= 25), i.get("peakG", 0) >= 20, bool(i.get("rollover")), bool(i.get("multiImpact")), no_resp])
    scene = sum([f in flags for f in "UBHEDXC"]) + (1 if ("P" in kinds or "M" in kinds) else 0)
    vit = sum([spo2 is not None and spo2 < 90, hr_abn, gcs is not None and gcs < 13, sbp is not None and sbp < 90])
    active = sum(1 for n in (sensor, scene, vit) if n >= 1)
    level = 2 if active >= 2 else 1 if max(sensor, scene, vit) >= 3 else 0
    level = min(2, level + min(2, max(0, i.get("independentReports", 1) - 1)))
    return {"band": band, "score": score, "conf": "LMH"[level], "rawPoints": raw, "redCriteria": red}

# ───────────── verify ─────────────
def load(name):
    with open(os.path.join(VEC, name), encoding="utf-8") as f:
        return json.load(f)

failures = []
def check(cond, msg):
    if not cond: failures.append(msg)

# CRC
crc = load("crc8.json")["cases"]
for c in crc:
    check(f"{crc8(c['input'].encode()):02X}" == c["crc"], f"crc8 mismatch for {c['input']!r}")
check(crc8(b"123456789") == 0xF4, "crc8 check value")

# valid packets
valid = load("dzmsd-valid.json")["cases"]
for c in valid:
    check(encode(c["packet"]) == c["wire"], f"encode mismatch {c['name']}: {encode(c['packet'])} != {c['wire']}")
    check(decode(c["wire"]) == c["packet"], f"decode mismatch {c['name']}")
    check(len(c["wire"]) <= 160 and all(ord(ch) < 128 for ch in c["wire"]), f"not SMS-safe {c['name']}")

# invalid packets: the independent decoder must also refuse them
invalid = load("dzmsd-invalid.json")["cases"]
refused = 0
for c in invalid:
    try:
        decode(c["wire"]); check(False, f"python decoder accepted invalid wire {c['wire']!r} ({c['code']})")
    except Exception:
        refused += 1

# NSI
cases = load("nsi-cases.json")["cases"]
for n, c in enumerate(cases):
    got = nsi(c["input"]); exp = c["expected"]
    for k in ("band", "score", "conf", "rawPoints"):
        check(got[k] == exp[k], f"nsi case {n} {k}: python={got[k]} ts={exp[k]} input={json.dumps(c['input'])}")
    check(got["redCriteria"] == exp["redCriteria"], f"nsi case {n} redCriteria")

# ranking (independent formula)
rk = load("ranking-worked-example.json")
inp = rk["input"]
REQ = ["ed24", "trauma_surgery", "ct", "icu", "neurosurgery"]
LOAD = {"OK": 1.0, "BUSY": 0.5, "SATURATED": 0.1, "UNKNOWN": 0.6}
LEVEL = {"A": 1.0, "B": 0.5, "C": 0.0}
scores, Cs = {}, {}
for h in inp["hospitals"]:
    eta = inp["etaMin"][h["id"]]
    T = max(0, 1 - eta / 60)
    C = len([x for x in REQ if x in h["capabilities"]]) / len(REQ)
    st = inp["statuses"].get(h["id"])
    L = LOAD["UNKNOWN"]
    if st and 0 <= (inp["now"] - st["setAt"]) / 3.6e6 <= 6: L = LOAD[st["status"]]
    scores[h["id"]] = round(0.45 * T + 0.35 * C + 0.15 * L + 0.05 * LEVEL[h["level"]] + 1e-12, 2)
    Cs[h["id"]] = C
check(scores == rk["expected"]["scores"], f"ranking scores: python={scores} ts={rk['expected']['scores']}")
levelA = any(h["level"] == "A" and inp["etaMin"][h["id"]] <= 60 for h in inp["hospitals"])
raw_order = sorted(scores, key=lambda k: -scores[k])
order = [k for k in raw_order if Cs[k] >= 0.75] + [k for k in raw_order if Cs[k] < 0.75] if levelA else raw_order
check(order == rk["expected"]["order"], f"ranking order: python={order} ts={rk['expected']['order']}")

print(f"CRC vectors:      {len(crc)}")
print(f"valid packets:    {len(valid)}  (encode + decode agree with TypeScript)")
print(f"invalid packets:  {refused}/{len(invalid)} refused by the independent decoder")
print(f"NSI cases:        {len(cases)}  (band, score, confidence, raw points, RED criteria)")
print(f"ranking example:  scores {scores} order {order}")
if failures:
    print(f"\nFAILED ({len(failures)}):")
    for f in failures[:20]: print(" -", f)
    sys.exit(1)
print("\nALL GOOD — TypeScript and Python agree.")
