/**
 * The SMS channel contract (docs/04 §3.4) and its in-memory fake for tests and the web preview. Pure TypeScript:
 * the Node tests import this file, never `sms.ts` (which binds react-native and the Kotlin module).
 */
export type SmsStatus = 'sent' | 'delivered' | 'failed';
export interface SmsResult { id: string; status: SmsStatus; code?: number | null }
export interface SimInfo { subscriptionId: number; carrier: string; slot: number; isDefaultSms: boolean }
export interface SendOpts { id: string; subscriptionId?: number | null }
export type SmsPermission = 'granted' | 'denied' | 'blocked' | 'unsupported';

export interface SmsChannel {
  /** the native module is in this build (Android) */
  readonly available: boolean;
  permission(): Promise<SmsPermission>;
  requestPermission(): Promise<SmsPermission>;
  /** full list needs READ_PHONE_STATE (requestSimAccess); without it: the default SMS SIM, carrier unknown */
  sims(): SimInfo[];
  requestSimAccess(): Promise<boolean>;
  /** resolves when Android accepted the message; rejects with a code (E_SMS_PERMISSION, E_SMS_UNAVAILABLE, …) */
  send(to: string, text: string, opts: SendOpts): Promise<void>;
  onResult(cb: (r: SmsResult) => void): { remove(): void };
}

/** An error's code as the native module set it (CodedException), else 'E_SMS'. */
export const smsErrorCode = (e: unknown): string => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : 'E_SMS';
};

export interface FakeSms extends SmsChannel {
  /** every accepted send, in order */
  sent: { to: string; text: string; opts: SendOpts }[];
  /** push a result as the radio would */
  emit(r: SmsResult): void;
  /** make the next sends throw this code (null = accept) */
  failWith: string | null;
  perm: SmsPermission;
}

export function fakeSms(o: { perm?: SmsPermission; sims?: SimInfo[] } = {}): FakeSms {
  const listeners = new Set<(r: SmsResult) => void>();
  const f: FakeSms = {
    available: true,
    sent: [],
    failWith: null,
    perm: o.perm ?? 'granted',
    permission: async () => f.perm,
    requestPermission: async () => f.perm,
    sims: () => o.sims ?? [{ subscriptionId: 1, carrier: 'FAKE', slot: 0, isDefaultSms: true }],
    requestSimAccess: async () => true,
    async send(to, text, opts) {
      if (f.failWith) throw Object.assign(new Error(f.failWith), { code: f.failWith });
      f.sent.push({ to, text, opts });
    },
    onResult(cb) {
      listeners.add(cb);
      return { remove: () => void listeners.delete(cb) };
    },
    emit: (r) => listeners.forEach((l) => l(r)),
  };
  return f;
}
