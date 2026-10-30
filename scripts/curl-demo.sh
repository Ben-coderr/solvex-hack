#!/usr/bin/env bash
# G1 drill: drive the real SMS webhook (signed like the gateway phone) and print what the server decided.
#   BASE_URL=http://localhost:3000 scripts/curl-demo.sh        (needs DEMO_MODE=true, pnpm db:users done)
# Reads secrets from .env.local; never prints them.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${BASE_URL:-http://localhost:3000}"
envval() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//'; }
SECRET="$(envval SMSGATE_WEBHOOK_SECRET)"
INGEST_KEY="$(envval INGEST_API_KEY)"
SUPA_URL="$(envval NEXT_PUBLIC_SUPABASE_URL)"
ANON="$(envval NEXT_PUBLIC_SUPABASE_ANON_KEY)"
PASS="$(envval DEMO_USER_PASSWORD)"
for v in SECRET INGEST_KEY SUPA_URL ANON PASS; do [ -n "${!v}" ] || { echo "missing $v in .env.local (run pnpm env:local)"; exit 1; }; done

# docs/05 §1.2 golden packets
EX1='SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E'
EX2='SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30'
BAD="${EX1%?}F"   # last CRC digit changed (EX1 must not end in F)
# Third report: different id, ~120 m north (+0.00108 deg lat) and 4 min after EX1, built by the shared encoder.
NEAR="$(pnpm -s exec tsx -e "
import { encodeDzmsd, encodePlusCode } from './packages/shared/src/index.ts';
const p = { id: 'M3RG3', band: 'U', score: 0, conf: 'L', lat: 36.47321, lon: 2.82871, time: '1436', src: 'W',
            veh: 1, pers: 1, kinds: ['C'], flags: ['X'] } as const;
console.log(encodeDzmsd({ ...p, kinds: [...p.kinds], flags: [...p.flags], plus: encodePlusCode(p.lat, p.lon) }));")"

# The instant T1432 resolves to on the server right now (today, or yesterday if 14:32 is still ahead).
CRASH_AT="$(pnpm -s exec tsx -e "
import { resolveCrashTime } from './packages/shared/src/index.ts';
console.log(new Date(resolveCrashTime('1432', new Date()).getTime() + 7000).toISOString());")"

TOKEN="$(curl -fsS "$SUPA_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'content-type: application/json' \
  -d "{\"email\":\"dispatcher@sellekni.test\",\"password\":\"$PASS\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')"
auth=(-H "Authorization: Bearer $TOKEN")

summ() { python3 -c '
import sys, json
b = json.load(sys.stdin); a = b.get("assessment") or {}
band = "%s%s%s v%s" % (a.get("band"), a.get("nsi"), a.get("conf"), a.get("version")) if a else "-"
print("%-9s incident=%s merged_count=%s assessment=%s error=%s" % (b.get("outcome", "?"), b.get("incident_id"), b.get("merged_count"), band, b.get("error")))'; }

sms() { # $1 label, $2 text, $3 sender
  local now ts body sig
  now="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"; ts="$(date +%s)"
  body="$(python3 -c 'import json,sys; print(json.dumps({"deviceId":"curl-demo","event":"sms:received","id":"e-"+sys.argv[3],"payload":{"messageId":"m-"+sys.argv[3],"message":sys.argv[1],"sender":sys.argv[2],"recipient":None,"simNumber":1,"receivedAt":sys.argv[4]},"webhookId":"curl-demo"}, separators=(",",":")))' "$2" "$3" "$RANDOM" "$now")"
  sig="$(printf '%s%s' "$body" "$ts" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')"
  printf '%-34s ' "$1"
  curl -fsS -X POST "$BASE_URL/api/sms/inbound" -H 'content-type: application/json' \
    -H "X-Timestamp: $ts" -H "X-Signature: $sig" --data-raw "$body" -w '\n' | summ
}

echo "== reset (DEMO_MODE)"
curl -fsS -X POST "$BASE_URL/api/demo/reset" "${auth[@]}" -w '\n'
echo "== SMS through the signed gateway webhook"
sms "1 canonical example 1 (auto)"     "$EX1"  "+213555000001"
sms "2 canonical example 2 (witness)"  "$EX2"  "+213555000002"
sms "3 example 1 with a corrupted CRC" "$BAD"  "+213555000003"
sms "4 example 1 re-delivered"         "$EX1"  "+213555000001"
sms "5 other id, ~120 m / +4 min"      "$NEAR" "+213555000004"
echo "== forged webhook (bad signature) must be refused"
printf '%-34s ' "6 unsigned/forged"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -X POST "$BASE_URL/api/sms/inbound" -H 'content-type: application/json' \
  -H "X-Timestamp: $(date +%s)" -H 'X-Signature: 00' -d '{"event":"sms:received","payload":{"message":"x"}}'
echo "== same incident over the JSON channel (x-sellekni-key) = same report, other channel"
printf '%-34s ' "7 JSON K7Q2M"
curl -fsS -X POST "$BASE_URL/api/incidents" -H 'content-type: application/json' -H "x-sellekni-key: $INGEST_KEY" -w '\n' -d '{
  "v":1,"incident_id":"K7Q2M","source":"auto","created_at":"'"$CRASH_AT"'",
  "location":{"lat":36.47213,"lon":2.82871},"crash":{"dv_kmh":71,"peak_g":38,"rollover":true,"no_response":true},
  "scene":{"vehicles":1,"persons":1,"kinds":["car"],"flags":[]},"vitals":{"hr":124,"spo2":89}}' | summ

echo "== dispatcher queue (GET /api/incidents)"
curl -fsS "$BASE_URL/api/incidents" "${auth[@]}" | python3 -c '
import sys, json
b = json.load(sys.stdin)
for i in b["incidents"]:
    print("  %s %-9s %s%s%s merged_count=%s first=%s unconfirmed_auto=%s" % (i["id"], i["status"], i["band"], i["nsi"], i["conf"], i["merged_count"], i["first_channel"], i["unconfirmed_auto"]))
for u in b["unparsed"]:
    print("  UNPARSED %s: %s" % (u["parse_error"], u["raw"]))'
