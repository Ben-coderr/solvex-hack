/**
 * D14: a hospital texts its load, e.g. `SLK STATUS CHU-A SAT`. Basic GSM-7, case and extra spaces tolerated.
 * The verb is BRAND.smsVerb; the caller passes it so this stays a pure function.
 */
export type StatusWord = 'OK' | 'BUSY' | 'SATURATED';
const WORDS: Record<string, StatusWord> = { OK: 'OK', BUSY: 'BUSY', OCC: 'BUSY', SAT: 'SATURATED', SATURATED: 'SATURATED', SATURE: 'SATURATED' };

export function parseStatusSms(text: string, verb: string): { hospitalId: string; status: StatusWord } | null {
  const m = text.trim().toUpperCase().match(new RegExp(`^${verb}\\s+STATUS\\s+([A-Z0-9-]{1,32})\\s+([A-Z]+)$`));
  const status = m ? WORDS[m[2]!] : undefined;
  return m && status ? { hospitalId: m[1]!, status } : null;
}

/** Phone numbers compared on their last 9 digits (+213 5xx… vs 05xx…). */
export const samePhone = (a: string, b: string) => {
  const d = (s: string) => s.replace(/\D/g, '').slice(-9);
  return d(a).length === 9 && d(a) === d(b);
};
