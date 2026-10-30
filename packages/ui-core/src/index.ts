/**
 * @najda/ui-core — display logic shared by the web and mobile design systems (no React, no I/O).
 * Validity always comes from @najda/shared's decoder; nothing here re-implements the protocol.
 */
import { SMS_SINGLE_MAX, decodeDzmsd, gsm7Length, isGsm7Basic, type Band, type DecodeResult } from '@najda/shared';

// ───────────────────────── triage vocabulary ─────────────────────────

export type TriageShape = 'triangle' | 'diamond' | 'circle' | 'square' | 'dashed-circle';

/** Shape + letter + colour (docs/06 §2). The shape alone must identify the band (greyscale, colour-blindness). */
export const TRIAGE_SHAPE: Readonly<Record<Band, TriageShape>> = {
  R: 'triangle', O: 'diamond', Y: 'circle', G: 'square', U: 'dashed-circle',
};
export const BAND_ORDER: readonly Band[] = ['R', 'O', 'Y', 'G', 'U'];

export const TRIAGE_SIZE = { row: 20, pin: 32, hero: 64 } as const;
export type TriageSize = keyof typeof TRIAGE_SIZE;

/**
 * SVG geometry for a marker drawn in a 100×100 viewBox, with the letter's optical centre.
 * Shapes are inset so a 2 px outline (scaled) is never clipped.
 */
export function triageGeometry(band: Band): { shape: TriageShape; path: string; letterY: number } {
  switch (TRIAGE_SHAPE[band]) {
    case 'triangle':
      return { shape: 'triangle', path: 'M50 4 L97 92 L3 92 Z', letterY: 63 };
    case 'diamond':
      return { shape: 'diamond', path: 'M50 4 L96 50 L50 96 L4 50 Z', letterY: 52 };
    case 'circle':
      return { shape: 'circle', path: 'M50 6 A44 44 0 1 1 49.99 6 Z', letterY: 52 };
    case 'square':
      return { shape: 'square', path: 'M10 10 H90 V90 H10 Z', letterY: 52 };
    case 'dashed-circle':
      return { shape: 'dashed-circle', path: 'M50 8 A42 42 0 1 1 49.99 8 Z', letterY: 52 };
  }
}

// ───────────────────────── packet → chips ─────────────────────────

export type PacketTokenKind =
  | 'magic' | 'id' | 'assessment' | 'coords' | 'time' | 'source' | 'count' | 'kinds'
  | 'physics' | 'flags' | 'vital' | 'plus' | 'crc' | 'unknown';
export type ChipState = 'ok' | 'suspect' | 'invalid';

export interface PacketToken { text: string; kind: PacketTokenKind; state: ChipState }

export interface PacketView {
  tokens: PacketToken[];
  /** GSM-7 septets; null when the text needs UCS-2 (then the SMS limit drops to 70) */
  length: number | null;
  max: number;
  /** pure basic GSM-7 alphabet (what DZ-MSD requires) */
  basicGsm7: boolean;
  decoded: DecodeResult;
}

const KIND_RULES: ReadonlyArray<[RegExp, PacketTokenKind]> = [
  [/^NAJDA\d$/, 'magic'],
  [/^#[0-9A-F]{2}$/, 'crc'],
  [/^[RYOGU]\d{2}[HML]$/, 'assessment'],
  [/^-?\d{1,2}\.\d+,-?\d{1,3}\.\d+$/, 'coords'],
  [/^T\d{4}$/, 'time'],
  [/^S[AWM]$/, 'source'],
  [/^[VP]\d{1,2}$/, 'count'],
  [/^K[CMTBPX]+$/, 'kinds'],
  [/^(D\d{1,3}|G\d{1,3}|RO)$/, 'physics'],
  [/^F[NUBHEDXCF]+$/, 'flags'],
  [/^(HR|SP)\d{1,3}$/, 'vital'],
  [/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$/, 'plus'],
];

/**
 * Split the wire text into display chips. Token kinds are a visual hint only; validity comes from decodeDzmsd:
 * a checksum failure marks the CRC chip invalid, any other parse error marks the whole packet invalid,
 * a Plus-Code/coordinates disagreement marks the Plus Code chip suspect.
 */
export function packetView(wire: string): PacketView {
  const decoded = decodeDzmsd(wire);
  const parts = wire.trim().split(/\s+/).filter(Boolean);
  const tokens: PacketToken[] = parts.map((text, i) => {
    let kind: PacketTokenKind = 'unknown';
    if (i === 1 && /^[0-9A-HJKMNP-TV-Z]{5}$/.test(text)) kind = 'id';
    else for (const [re, k] of KIND_RULES) if (re.test(text)) { kind = k; break; }
    return { text, kind, state: 'ok' as ChipState };
  });

  if (!decoded.ok) {
    const crcOnly = decoded.code === 'checksum_mismatch';
    for (const t of tokens) t.state = crcOnly ? (t.kind === 'crc' ? 'invalid' : 'suspect') : 'invalid';
  } else if (decoded.warnings.some((w) => /plus/i.test(w))) {
    for (const t of tokens) if (t.kind === 'plus') t.state = 'suspect';
  }

  return { tokens, length: gsm7Length(wire), max: SMS_SINGLE_MAX, basicGsm7: isGsm7Basic(wire), decoded };
}

// ───────────────────────── time & numbers ─────────────────────────

/** Golden-ring ticks (minutes since impact). Informative, not alarming. */
export const GOLDEN_TICKS = [10, 30, 60] as const;
export const GOLDEN_SPAN_MIN = 60;

/** Fraction 0..1 of the golden window elapsed (clamped). */
export const goldenFraction = (elapsedMin: number): number => Math.min(1, Math.max(0, elapsedMin / GOLDEN_SPAN_MIN));

/** Stroke dash for a ring of radius r showing fraction f (SVG strokeDasharray/offset). */
export function ringDash(r: number, f: number): { circumference: number; offset: number } {
  const c = 2 * Math.PI * r;
  return { circumference: c, offset: c * (1 - Math.min(1, Math.max(0, f))) };
}

/** "0:42", "12 min", "2 h 05" — Western digits in every locale (docs/06 §3). */
export function formatAge(ms: number): { value: string; unit: 'clock' | 'min' | 'h' } {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return { value: `0:${String(s).padStart(2, '0')}`, unit: 'clock' };
  const m = Math.floor(s / 60);
  if (m < 60) return { value: String(m), unit: 'min' };
  return { value: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'h' };
}

/** Lifecycle steps shown in the bar (CANCELLED / MERGED are side exits, not steps). */
export const LIFECYCLE_STEPS = [
  'RECEIVED', 'ACKNOWLEDGED', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'AT_HOSPITAL', 'CLOSED',
] as const;
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

export const CAPABILITIES = ['ed24', 'trauma_surgery', 'ct', 'icu', 'neurosurgery', 'pediatrics', 'burns', 'general_surgery'] as const;
export type CapabilityCode = (typeof CAPABILITIES)[number];
