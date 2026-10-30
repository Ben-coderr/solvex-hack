// Fill EMPTY keys of the repo-root .env.local for local development. Never overwrites a value you set,
// never prints a value: only the names of the keys it filled.
//   local Supabase URLs/keys ← `supabase status -o json` (well-known local-only defaults)
//   secrets                  ← fresh random bytes
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = '.env.local';
if (!existsSync(FILE)) writeFileSync(FILE, readFileSync('.env.example', 'utf8'));

let status;
try {
  status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.error('env-local: `supabase status` failed — run `supabase start` first.');
  process.exit(1);
}

const secret = (n) => randomBytes(n).toString('base64url');
const fills = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  DATABASE_URL: status.DB_URL,
  LINK_SIGNING_SECRET: secret(48),
  INGEST_API_KEY: secret(24),
  SMSGATE_WEBHOOK_SECRET: secret(24),
  DEMO_USER_PASSWORD: secret(12),
};

const lines = readFileSync(FILE, 'utf8').split('\n');
const seen = new Set();
const filled = [];
const out = lines.map((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) return line;
  const [, key, rest] = m;
  seen.add(key);
  const value = rest.replace(/\s+#.*$/, '').trim();
  if (value || !(key in fills)) return line;
  filled.push(key);
  return `${key}=${fills[key]}`;
});
for (const [key, val] of Object.entries(fills)) {
  if (!seen.has(key)) {
    out.push(`${key}=${val}`);
    filled.push(key);
  }
}
writeFileSync(FILE, out.join('\n'), { mode: 0o600 });
console.log(filled.length ? `env-local: filled ${filled.join(', ')}` : 'env-local: nothing to fill');
