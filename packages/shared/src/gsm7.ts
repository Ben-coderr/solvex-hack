/**
 * GSM 03.38 (GSM-7) helpers. A single SMS holds 160 septets in GSM-7,
 * but only 70 UCS-2 characters as soon as ONE non-GSM character appears.
 * Extension-table characters (^ { } \ [ ~ ] | € and form feed) cost 2 septets.
 */
const ESC = '\u001b';
// 128 entries; index 0x1B is the escape-to-extension marker.
const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ' + ESC + 'ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const EXT = '\f^{}\\[~]|€';

const BASIC_SET = new Set(BASIC.split('').filter((c) => c !== ESC));
const EXT_SET = new Set(EXT.split(''));

export const SMS_SINGLE_MAX = 160;

/** Number of septets, or null if the text contains any non-GSM-7 character. */
export function gsm7Length(text: string): number | null {
  let n = 0;
  for (const ch of text) {
    if (BASIC_SET.has(ch)) n += 1;
    else if (EXT_SET.has(ch)) n += 2;
    else return null;
  }
  return n;
}

export const isGsm7 = (text: string): boolean => gsm7Length(text) !== null;

/** True if the text uses ONLY the basic table (no 2-septet extension chars). */
export function isGsm7Basic(text: string): boolean {
  for (const ch of text) if (!BASIC_SET.has(ch)) return false;
  return true;
}

export const __internal = { BASIC, EXT };
