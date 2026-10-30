// Prove G1's Realtime leg the way the dashboard will see it: sign in as the demo dispatcher (anon key + RLS),
// subscribe to postgres_changes on the published tables, print one line per event.
//   pnpm realtime:probe            (Ctrl+C to stop; --seconds=N to exit after N s)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = process.env.DEMO_USER_PASSWORD!;
const seconds = Number(process.argv.find((a) => a.startsWith('--seconds='))?.split('=')[1] ?? 0);
const TABLES = ['incidents', 'reports', 'assessments', 'prealerts'] as const;

const supabase = createClient(url, anon, { auth: { persistSession: false } });
const { error } = await supabase.auth.signInWithPassword({ email: 'dispatcher@najda.test', password });
if (error) {
  console.error(`realtime-probe: sign-in failed (${error.message}). Run pnpm db:users first.`);
  process.exit(1);
}

let channel = supabase.channel('najda-probe');
for (const table of TABLES) {
  channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
    const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as Record<string, unknown>;
    const brief =
      table === 'incidents' ? `${row.id} ${row.status} ${row.band}${row.nsi}${row.conf} merged=${row.merged_count}`
      : table === 'reports' ? `${row.client_id ?? '-'} ${row.channel} ${row.parse_error ? `UNPARSED(${row.parse_error})` : 'parsed'}`
      : table === 'assessments' ? `${row.incident_id} v${row.version} ${row.band}${row.nsi}${row.conf}`
      : `${row.incident_id} -> ${row.hospital_id} ${row.channel}${row.acked_at ? ' ACK' : ''}`;
    console.log(`${new Date().toISOString()}  ${p.eventType.padEnd(6)} ${table.padEnd(11)} ${brief}`);
  });
}
channel.subscribe((status, err) => {
  console.log(`realtime-probe: ${status}${err ? ` (${err.message})` : ''} — tables: ${TABLES.join(', ')}`);
});
if (seconds > 0) setTimeout(async () => { await supabase.removeAllChannels(); process.exit(0); }, seconds * 1000);
