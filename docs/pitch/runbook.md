# Demo runbook

## Switch to backup (laptop dead or the local stack won't come up)
1. On any laptop or phone with mobile data: open **`[BACKUP_URL]`/login** → dispatcher@sellekni.test (same password as on the stage laptop).
2. `/demo` → **Reset**; open a second tab or private window → hospital-a@sellekni.test.
3. Phone A → Settings → Server address = `[BACKUP_URL]`, then replay `rollover_71` with data ON (ladder rung 3); or **Simulate SMS** on the dashboard (rung 2).
4. No real SMS on the backup: the gateway phone talks only to the laptop. Say "the SMS path is in our video" and play clip 04.
5. Anything stalls > 5 s → videos (ladder rung 4).

## The backup itself (docs/08 §3.3) — set up on day −1
Supabase Free (`[PROJECT_REF]`, region `[region]`) for DB + Auth + Realtime, Vercel Hobby (`[BACKUP_URL]`) for the web
app, `DEMO_MODE=true`, `SMSGATE_MODE=sim`, `HOSPITAL_SET` the same as the laptop. **Synthetic data only.**

```bash
supabase login && supabase link --project-ref <ref>
supabase db push                                   # every migration, incl. 20261031000002_hospital_scope
psql "<pooler URL>" -f supabase/seed.sql           # hospitals + statuses
# Dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" = OFF
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… HOSPITAL_SET=… pnpm db:users   # the three demo logins (same password)
npx vercel link            # root directory: apps/web
npx vercel env add …       # DATABASE_URL (pooler, port 6543), NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                           # SUPABASE_SERVICE_ROLE_KEY (server only), INGEST_API_KEY, LINK_SIGNING_SECRET, SMSGATE_WEBHOOK_SECRET,
                           # SMSGATE_MODE=sim, DEMO_MODE=true, HOSPITAL_SET, PUBLIC_BASE_URL=<backup url>
npx vercel --prod
```
End-to-end test (from a phone on mobile data, not the laptop's network): login → Simulate SMS → pin → orientation →
pre-alert → hospital ACK ✓ → audit. Record the date and result below.

| Date | Tested from | Result |
|---|---|---|
| | | |

**Wake-up:** Supabase Free pauses after 7 idle days. The day before and the morning of the demo, open `[BACKUP_URL]`
and log in once.
