// Create/refresh the demo logins (idempotent). Uses the service-role key: run locally only, never ship this key.
//   pnpm db:users
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_USER_PASSWORD;
if (!url || !serviceKey || !password) {
  console.error('seed-users: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_USER_PASSWORD are required (pnpm env:local)');
  process.exit(1);
}

// hospital logins follow the active set (data/demo-hospitals.json): re-run after changing HOSPITAL_SET
const set = process.env.HOSPITAL_SET === 'demo' ? 'demo' : 'national';
const logins = JSON.parse(readFileSync('data/demo-hospitals.json', 'utf8')).logins[set] as Record<'hospital-a' | 'hospital-b', string>;

const USERS = [
  { email: 'dispatcher@sellekni.test', role: 'dispatcher', hospital_id: null, display_name: 'Dispatcher (demo)' },
  { email: 'hospital-a@sellekni.test', role: 'hospital', hospital_id: logins['hospital-a'], display_name: 'Hospital A ED (demo)' },
  { email: 'hospital-b@sellekni.test', role: 'hospital', hospital_id: logins['hospital-b'], display_name: 'Hospital B ED (demo)' },
] as const;

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;

for (const u of USERS) {
  const existing = list.users.find((x) => x.email === u.email);
  const id = existing
    ? (await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })).data.user?.id
    : (await admin.auth.admin.createUser({ email: u.email, password, email_confirm: true })).data.user?.id;
  if (!id) throw new Error(`seed-users: could not create ${u.email}`);
  const { error } = await admin.from('profiles').upsert({ user_id: id, role: u.role, hospital_id: u.hospital_id, display_name: u.display_name });
  if (error) throw error;
  console.log(`seed-users: ${u.email} (${u.role}${u.hospital_id ? ` · ${u.hospital_id}` : ''})`);
}
