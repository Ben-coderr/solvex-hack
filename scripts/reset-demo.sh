#!/usr/bin/env bash
# P8 — one command between two demo runs (docs/10 §3 setup, docs/08 §4 checklist). Synthetic data only.
#
#   scripts/reset-demo.sh            restart the web app in the mode it runs in now (dev, or prod: rebuilds)
#   scripts/reset-demo.sh --prod     force the production build (the stage mode)
#   scripts/reset-demo.sh --dev      force next dev
#
# 1. restarts the web app (stops what ./sellekni started, starts it again; Supabase stays up, its data is reset below)
# 2. reseeds the hospitals from supabase/seed.sql (upsert: the demo logins' hospitals are never deleted)
# 3. resets the demo DB through /api/demo/reset (incidents, reports, pre-alerts, audit, SMS outbox, ETA cache,
#    hospital statuses back to data/hospitals.seed.json, rate limits)
# 4. prints a checklist and exits 1 if any line is red. The gateway phone's own message list cannot be cleared from
#    the laptop (the SMS Gateway app has no delete API): the checklist reminds you to do it by hand.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.sellekni"
if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'; else B= G= Y= R= D= N=; fi
T0=$(date +%s)
FAILED=0
LINES=()
pass() { LINES+=("  ${G}✓${N} $*"); }
fail() { LINES+=("  ${R}✗${N} $*"); FAILED=1; }
note() { LINES+=("  ${Y}!${N} $*"); }
envget() { grep -E "^$1=" "$ROOT/.env.local" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/' || true; }

mode=""
for a in "$@"; do case "$a" in --prod) mode=prod ;; --dev) mode=dev ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done
if [[ -z "$mode" ]]; then
  mode=dev
  ps -o command= -p "$(cat "$RUN/web.pid" 2>/dev/null || echo 0)" 2>/dev/null | grep -q "next start" && mode=prod
fi

printf '%s\n' "${B}▸ reset-demo${N} ${D}(web: $mode)${N}"

# ── 1. web app ──
"$ROOT/sellekni" down >/dev/null
if [[ "$mode" == prod ]]; then "$ROOT/sellekni" up --prod >"$RUN/reset-up.log" 2>&1 || { tail -30 "$RUN/reset-up.log"; exit 1; }
else "$ROOT/sellekni" up --replace >"$RUN/reset-up.log" 2>&1 || { tail -30 "$RUN/reset-up.log"; exit 1; }; fi
URL="http://localhost:$(cat "$RUN/web.port")"
HEALTH="$(curl -fsS -m 5 "$URL/api/health" || true)"
[[ -n "$HEALTH" ]] && pass "web app restarted ($mode) at $URL" || fail "web app not healthy at $URL (.sellekni/web.log)"

# ── 2. hospitals ──
DB_URL="$(cd "$ROOT" && supabase status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
want="$(awk '/^insert into public.hospitals /{on=1; next} on && /^  \(/{n++} on && /;$/{on=0} END{print n+0}' "$ROOT/supabase/seed.sql")"
# load the generated inserts into a temp table, then upsert: deleting would break the hospital logins' profiles
{
  echo 'begin;'
  echo 'create temp table seed_h (like public.hospitals including defaults) on commit drop;'
  awk '/^insert into public.hospitals /{on=1} on{print} on && /;$/{on=0}' "$ROOT/supabase/seed.sql" | sed '1s/^insert into public.hospitals /insert into seed_h /'
  echo 'insert into public.hospitals select * from seed_h on conflict (id) do update set
    name = excluded.name, level = excluded.level, wilaya_code = excluded.wilaya_code, phone_sms = excluded.phone_sms,
    capabilities = excluded.capabilities, location = excluded.location, source = excluded.source, verified = excluded.verified;'
  echo 'delete from public.hospitals h where not exists (select 1 from seed_h s where s.id = h.id)
    and not exists (select 1 from public.profiles p where p.hospital_id = h.id);'
  echo 'commit;'
} | psql "$DB_URL" -q -v ON_ERROR_STOP=1 >/dev/null 2>"$RUN/reset-hospitals.log" || true
have="$(psql "$DB_URL" -Atc 'select count(*) from public.hospitals' 2>/dev/null || echo 0)"
[[ "$have" == "$want" ]] && pass "hospitals reseeded ($have from seed.sql)" || fail "hospitals: $have in the DB, $want in seed.sql (.sellekni/reset-hospitals.log)"

# ── 3. demo database ──
if (cd "$ROOT/apps/web" && BASE_URL="$URL" pnpm -s exec tsx scripts/open-demo.mts --reset-only >"$RUN/reset-api.log" 2>&1); then
  pass "demo DB reset through /api/demo/reset (rate limits cleared)"
else fail "demo reset failed: $(tail -1 "$RUN/reset-api.log")"; fi
read -r inc out pre aud st <<<"$(psql "$DB_URL" -AtF' ' -c "select (select count(*) from incidents), (select count(*) from sms_outbox),
  (select count(*) from prealerts), (select count(*) from audit_events), (select count(*) from hospital_status)")"
[[ "$inc" == 0 && "$pre" == 0 ]] && pass "incidents 0 · pre-alerts 0" || fail "incidents $inc · pre-alerts $pre"
[[ "$out" == 0 ]] && pass "SMS outbox empty (laptop side)" || fail "SMS outbox: $out rows"
[[ "$aud" == 1 ]] && pass "audit log: only the reset entry" || fail "audit log: $aud rows"
wst="$(node -e 'console.log((require(process.argv[1]).statuses??[]).length)' "$ROOT/data/hospitals.seed.json")"
[[ "$st" == "$wst" ]] && pass "hospital statuses back to the seed ($st)" || fail "hospital statuses: $st, seed has $wst"
users="$(psql "$DB_URL" -Atc "select count(*) from auth.users where email in ('dispatcher@sellekni.test','hospital-a@sellekni.test','hospital-b@sellekni.test')")"
[[ "$users" == 3 ]] && pass "demo logins present (3)" || fail "demo logins: $users of 3"

# ── 4. what the app says about itself ──
grep -q '"demo":true' <<<"$HEALTH" && pass "DEMO_MODE on (/demo, /phones, Simulate SMS)" || fail "DEMO_MODE off: /demo and Simulate SMS are hidden"
grep -q '"offlineTiles":true' <<<"$HEALTH" && pass "offline map tiles served" || note "no offline tiles (apps/web/public/tiles/sellekni.pmtiles): the map needs internet"

# ── 5. gateway phone ──
case "$(envget SMSGATE_MODE)" in
  local)
    gw="$(envget SMSGATE_BASE_URL)"
    if curl -fsS -m 3 -u "$(envget SMSGATE_USER):$(envget SMSGATE_PASSWORD)" "$gw/health" >/dev/null 2>&1; then pass "gateway phone answers at $gw"
    else note "gateway phone not reachable at $gw (USB + adb reverse/forward: docs/field-notes/G4-drill.md) — ladder step 2: Simulate SMS"; fi ;;
  sim) note "SMSGATE_MODE=sim: no real SMS goes out (fine for rehearsal, not for the stage)" ;;
  *) note "SMSGATE_MODE=$(envget SMSGATE_MODE)" ;;
esac
note "by hand: on the gateway phone, clear the SMS Gateway message list and the Messages inbox; driver phone: clear its outbox"

printf '%s\n' "${LINES[@]}"
el=$(( $(date +%s) - T0 ))
if [[ $FAILED == 0 ]]; then printf '%s\n' "${G}${B}READY${N} in ${el}s — $URL"; else printf '%s\n' "${R}${B}NOT READY${N} (${el}s)"; exit 1; fi
