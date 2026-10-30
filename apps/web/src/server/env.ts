import 'server-only';
import { z } from 'zod';

// Server-only configuration. Nothing here may ever be exposed through NEXT_PUBLIC_*.
const Env = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  INGEST_API_KEY: z.string().min(16),
  LINK_SIGNING_SECRET: z.string().min(32),
  SMSGATE_MODE: z.enum(['local', 'cloud', 'sim']).default('sim'),
  SMSGATE_BASE_URL: z.string().url().optional().or(z.literal('')),
  SMSGATE_USER: z.string().optional(),
  SMSGATE_PASSWORD: z.string().optional(),
  SMSGATE_WEBHOOK_SECRET: z.string().min(16),
  OSRM_URL: z.string().url().optional().or(z.literal('')),
  ORS_API_KEY: z.string().optional(),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type ServerEnv = z.infer<typeof Env>;

let cached: ServerEnv | undefined;

/** Parsed lazily so `next build` does not need secrets; fails loudly on first use if misconfigured. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    // Names only, never values.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Server environment invalid or missing: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}
