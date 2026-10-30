import { crc8, crc8Hex } from './crc8';
import { gsm7Length, SMS_SINGLE_MAX } from './gsm7';
import { decodePlusCode, PLUS_CODE_RE } from './pluscode';
import {
  BAND_VALUES, CONF_VALUES, FLAG_ORDER, KIND_ORDER, SOURCE_VALUES,
  type Band, type Confidence, type DzmsdPacket, type Flag, type Kind, type Source,
} from './types';

export const MAGIC = 'NAJDA1';
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I L O U
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{5}$/;

export type DecodeErrorCode =
  | 'empty' | 'bad_magic' | 'missing_checksum' | 'bad_checksum_format' | 'checksum_mismatch'
  | 'too_few_tokens' | 'bad_id' | 'bad_assessment' | 'bad_coordinates' | 'bad_token'
  | 'duplicate_token' | 'missing_field' | 'out_of_range' | 'bad_pluscode';

export class DzmsdError extends Error {
  constructor(public readonly code: DecodeErrorCode | 'encode_invalid' | 'sms_too_long' | 'sms_not_gsm7', message: string) {
    super(message);
    this.name = 'DzmsdError';
  }
}

export type DecodeResult =
  | { ok: true; packet: DzmsdPacket; warnings: string[] }
  | { ok: false; code: DecodeErrorCode; message: string };

// ───────────────────────── encode ─────────────────────────

const fmtCoord = (n: number): string => {
  const s = n.toFixed(5);
  return s === '-0.00000' ? '0.00000' : s; // never emit negative zero
};
const pad2 = (n: number): string => String(n).padStart(2, '0');
const isInt = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

function canonical<T extends string>(items: readonly T[], order: readonly T[], what: string): string {
  const set = new Set(items);
  if (set.size !== items.length) throw new DzmsdError('encode_invalid', `duplicate ${what}`);
  for (const i of set) if (!order.includes(i)) throw new DzmsdError('encode_invalid', `unknown ${what} "${i}"`);
  return order.filter((o) => set.has(o)).join('');
}

/** Validate a packet; throws DzmsdError('encode_invalid') with a precise message. */
export function validatePacket(p: DzmsdPacket): void {
  const bad = (m: string): never => { throw new DzmsdError('encode_invalid', m); };
  if (!ID_RE.test(p.id)) bad(`id must be 5 Crockford-base32 chars, got "${p.id}"`);
  if (!BAND_VALUES.includes(p.band)) bad(`bad band "${p.band}"`);
  if (!isInt(p.score, 0, 99)) bad(`score must be an integer 0..99, got ${p.score}`);
  if (!CONF_VALUES.includes(p.conf)) bad(`bad conf "${p.conf}"`);
  if (!(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90)) bad(`lat out of range: ${p.lat}`);
  if (!(Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180)) bad(`lon out of range: ${p.lon}`);
  if (!/^([01]\d|2[0-3])[0-5]\d$/.test(p.time)) bad(`time must be HHMM (00:00-23:59), got "${p.time}"`);
  if (!SOURCE_VALUES.includes(p.src)) bad(`bad src "${p.src}"`);
  if (!isInt(p.veh, 0, 99)) bad(`veh must be an integer 0..99`);
  if (!isInt(p.pers, 0, 99)) bad(`pers must be an integer 0..99`);
  if (!p.kinds || p.kinds.length === 0) bad('kinds must contain at least one entry (use "X" if unknown)');
  if (p.dv !== undefined && !isInt(p.dv, 0, 999)) bad(`dv must be an integer 0..999`);
  if (p.g !== undefined && !isInt(p.g, 0, 999)) bad(`g must be an integer 0..999`);
  if (p.hr !== undefined && !isInt(p.hr, 0, 999)) bad(`hr must be an integer 0..999`);
  if (p.spo2 !== undefined && !isInt(p.spo2, 0, 100)) bad(`spo2 must be an integer 0..100`);
  if (p.plus !== undefined && !PLUS_CODE_RE.test(p.plus)) bad(`plus must be a 10-digit Plus Code, got "${p.plus}"`);
}

/** The packet body: everything before " #CC". */
export function encodeBody(p: DzmsdPacket): string {
  validatePacket(p);
  const t: string[] = [
    MAGIC, p.id, `${p.band}${pad2(p.score)}${p.conf}`,
    `${fmtCoord(p.lat)},${fmtCoord(p.lon)}`,
    `T${p.time}`, `S${p.src}`, `V${p.veh}`, `P${p.pers}`,
    `K${canonical<Kind>(p.kinds, KIND_ORDER, 'kind')}`,
  ];
  if (p.dv !== undefined) t.push(`D${p.dv}`);
  if (p.g !== undefined) t.push(`G${p.g}`);
  if (p.roll) t.push('RO');
  if (p.flags && p.flags.length > 0) t.push(`F${canonical<Flag>(p.flags, FLAG_ORDER, 'flag')}`);
  if (p.hr !== undefined) t.push(`HR${p.hr}`);
  if (p.spo2 !== undefined) t.push(`SP${p.spo2}`);
  if (p.plus) t.push(p.plus);
  return t.join(' ');
}

/**
 * Encode to the SMS wire form `<body> #<CRC8 hex>`.
 * Throws if the result would not fit one GSM-7 SMS (160 septets).
 */
export function encodeDzmsd(p: DzmsdPacket): string {
  const body = encodeBody(p);
  const wire = `${body} #${crc8Hex(body)}`;
  const len = gsm7Length(wire);
  if (len === null) throw new DzmsdError('sms_not_gsm7', 'packet contains non-GSM-7 characters');
  if (len > SMS_SINGLE_MAX) throw new DzmsdError('sms_too_long', `packet is ${len} septets (> ${SMS_SINGLE_MAX})`);
  return wire;
}

// ───────────────────────── decode ─────────────────────────

/** Trim, collapse whitespace (incl. NBSP from copy/paste) and upper-case: tolerant of SMS keyboards. */
export const normalise = (s: string): string => s.trim().replace(/\s+/g, ' ').toUpperCase();

const fail = (code: DecodeErrorCode, message: string): DecodeResult => ({ ok: false, code, message });

export function decodeDzmsd(raw: string): DecodeResult {
  const s = normalise(raw ?? '');
  if (!s) return fail('empty', 'empty message');
  if (!s.startsWith(MAGIC + ' ')) return fail('bad_magic', `message does not start with "${MAGIC} "`);

  const cut = s.lastIndexOf(' #');
  if (cut < 0) return fail('missing_checksum', 'no " #CC" checksum suffix');
  const body = s.slice(0, cut);
  const cs = s.slice(cut + 2);
  if (!/^[0-9A-F]{2}$/.test(cs)) return fail('bad_checksum_format', `checksum "${cs}" is not 2 hex digits`);
  const expected = crc8Hex(body);
  if (expected !== cs) return fail('checksum_mismatch', `checksum mismatch: got ${cs}, expected ${expected}`);

  const tok = body.split(' ');
  if (tok.length < 4) return fail('too_few_tokens', 'header needs magic, id, assessment and coordinates');

  const [, id, assess, coords] = tok as [string, string, string, string];
  if (!ID_RE.test(id)) return fail('bad_id', `bad incident id "${id}"`);
  const am = /^([ROYGU])(\d{2})([HML])$/.exec(assess);
  if (!am) return fail('bad_assessment', `bad assessment token "${assess}"`);
  const cm = /^(-?\d{1,2}\.\d{5}),(-?\d{1,3}\.\d{5})$/.exec(coords);
  if (!cm) return fail('bad_coordinates', `bad coordinates token "${coords}"`);
  const lat = Number(cm[1]);
  const lon = Number(cm[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return fail('out_of_range', 'coordinates out of range');

  const seen = new Set<string>();
  const warnings: string[] = [];
  const out: Partial<DzmsdPacket> = {};
  const once = (key: string): boolean => (seen.has(key) ? false : (seen.add(key), true));
  const dup = (key: string) => fail('duplicate_token', `duplicate ${key} token`);

  for (const x of tok.slice(4)) {
    let m: RegExpExecArray | null;
    if (x.includes('+')) {
      if (!PLUS_CODE_RE.test(x)) return fail('bad_pluscode', `bad plus code "${x}"`);
      if (!once('plus')) return dup('plus code');
      out.plus = x;
    } else if (x === 'RO') {
      if (!once('RO')) return dup('RO');
      out.roll = true;
    } else if ((m = /^HR(\d{1,3})$/.exec(x))) {
      if (!once('HR')) return dup('HR');
      out.hr = Number(m[1]);
    } else if ((m = /^SP(\d{1,3})$/.exec(x))) {
      if (!once('SP')) return dup('SP');
      const v = Number(m[1]);
      if (v > 100) return fail('out_of_range', `SpO2 ${v} > 100`);
      out.spo2 = v;
    } else if ((m = /^T(\d{4})$/.exec(x))) {
      if (!once('T')) return dup('T');
      if (!/^([01]\d|2[0-3])[0-5]\d$/.test(m[1]!)) return fail('out_of_range', `invalid time ${m[1]}`);
      out.time = m[1]!;
    } else if ((m = /^S([AWM])$/.exec(x))) {
      if (!once('S')) return dup('S');
      out.src = m[1] as Source;
    } else if ((m = /^V(\d{1,2})$/.exec(x))) {
      if (!once('V')) return dup('V');
      out.veh = Number(m[1]);
    } else if ((m = /^P(\d{1,2})$/.exec(x))) {
      if (!once('P')) return dup('P');
      out.pers = Number(m[1]);
    } else if ((m = /^K([CMTBPX]+)$/.exec(x))) {
      if (!once('K')) return dup('K');
      const arr = m[1]!.split('') as Kind[];
      if (new Set(arr).size !== arr.length) return fail('bad_token', `repeated kind in "${x}"`);
      out.kinds = KIND_ORDER.filter((k) => arr.includes(k));
    } else if ((m = /^D(\d{1,3})$/.exec(x))) {
      if (!once('D')) return dup('D');
      out.dv = Number(m[1]);
    } else if ((m = /^G(\d{1,3})$/.exec(x))) {
      if (!once('G')) return dup('G');
      out.g = Number(m[1]);
    } else if ((m = /^F([NUBHEDXCF]+)$/.exec(x))) {
      if (!once('F')) return dup('F');
      const arr = m[1]!.split('') as Flag[];
      if (new Set(arr).size !== arr.length) return fail('bad_token', `repeated flag in "${x}"`);
      out.flags = FLAG_ORDER.filter((f) => arr.includes(f));
    } else if (/^[A-Z]{1,2}\d*[A-Z0-9]*$/.test(x) && !/^(T|S|V|P|K|D|G|F|HR|SP)/.test(x)) {
      // Forward compatibility: a token with an unassigned prefix is kept as a warning, not an error.
      warnings.push(`unknown token "${x}" ignored`);
    } else {
      return fail('bad_token', `malformed token "${x}"`);
    }
  }

  for (const [key, field] of [['T', 'time'], ['S', 'src'], ['V', 'veh'], ['P', 'pers'], ['K', 'kinds']] as const) {
    if (!seen.has(key)) return fail('missing_field', `missing required ${field} token (${key})`);
  }

  const packet: DzmsdPacket = {
    id, band: am[1] as Band, score: Number(am[2]), conf: am[3] as Confidence, lat, lon,
    time: out.time!, src: out.src!, veh: out.veh!, pers: out.pers!, kinds: out.kinds!,
    ...(out.dv !== undefined && { dv: out.dv }),
    ...(out.g !== undefined && { g: out.g }),
    ...(out.roll && { roll: true }),
    ...(out.flags && { flags: out.flags }),
    ...(out.hr !== undefined && { hr: out.hr }),
    ...(out.spo2 !== undefined && { spo2: out.spo2 }),
    ...(out.plus && { plus: out.plus }),
  };

  if (packet.plus) {
    const a = decodePlusCode(packet.plus);
    if (Math.abs(a.latCenter - lat) > 0.0005 || Math.abs(a.lonCenter - lon) > 0.0005) {
      warnings.push('plus code does not match the coordinates (> ~55 m apart)');
    }
  }
  return { ok: true, packet, warnings };
}

export function decodeDzmsdOrThrow(raw: string): DzmsdPacket {
  const r = decodeDzmsd(raw);
  if (!r.ok) throw new DzmsdError(r.code, r.message);
  return r.packet;
}

// ───────────────────────── helpers ─────────────────────────

/** Algeria is UTC+1 all year (no DST since 2006). */
const ALGIERS_OFFSET_MIN = 60;

export function formatHHMM(date: Date): string {
  const d = new Date(date.getTime() + ALGIERS_OFFSET_MIN * 60_000);
  return pad2(d.getUTCHours()) + pad2(d.getUTCMinutes());
}

/**
 * Rebuild the full crash instant from the packet's HHMM and the receive timestamp.
 * If the result lands more than 5 min in the future, the crash was "yesterday" (midnight rollover).
 */
export function resolveCrashTime(hhmm: string, receivedAt: Date): Date {
  const local = new Date(receivedAt.getTime() + ALGIERS_OFFSET_MIN * 60_000);
  const utcMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(hhmm.slice(0, 2)), Number(hhmm.slice(2))) -
    ALGIERS_OFFSET_MIN * 60_000;
  return new Date(utcMs > receivedAt.getTime() + 5 * 60_000 ? utcMs - 86_400_000 : utcMs);
}

/** 5-char Crockford-base32 incident id. Inject `random` (e.g. expo-crypto) on React Native. */
export function generateIncidentId(random?: (n: number) => Uint8Array): string {
  const rnd =
    random ??
    ((n: number) => {
      const a = new Uint8Array(n);
      const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
      if (c?.getRandomValues) c.getRandomValues(a);
      else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
      return a;
    });
  const bytes = rnd(5);
  let id = '';
  for (let i = 0; i < 5; i++) id += CROCKFORD[bytes[i]! & 31];
  return id;
}

export { crc8 };
