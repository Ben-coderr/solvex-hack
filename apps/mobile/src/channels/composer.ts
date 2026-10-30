/**
 * Composer fallback (docs/04 §3.3): expo-sms opens the system SMS app pre-filled with the packet; the PERSON presses
 * Send. Android never reports whether it went (expo-sms returns 'unknown'), so callers record "composer opened",
 * never "sent". Used when the native channel is missing or SEND_SMS is refused.
 */
import * as SMS from 'expo-sms';

export type ComposerOpen = 'opened' | 'unavailable';

export async function openComposer(to: string, text: string): Promise<ComposerOpen> {
  if (!(await SMS.isAvailableAsync().catch(() => false))) return 'unavailable';
  try {
    await SMS.sendSMSAsync([to], text);
    return 'opened';
  } catch {
    return 'unavailable';
  }
}
