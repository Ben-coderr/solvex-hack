/** Triage band: R critical · O serious · Y moderate · G minor (confirmed) · U unknown. */
export type Band = 'R' | 'O' | 'Y' | 'G' | 'U';
export type Confidence = 'H' | 'M' | 'L';
/** A auto-detected · W witness · M manual SOS */
export type Source = 'A' | 'W' | 'M';
/** C car · M motorcycle · T truck · B bus · P pedestrian · X other/unknown */
export type Kind = 'C' | 'M' | 'T' | 'B' | 'P' | 'X';
/**
 * N no response to countdown · U unresponsive (witness) · B breathing difficulty · H heavy bleeding
 * E ejected · D death in vehicle · X trapped · C child involved · F fire
 */
export type Flag = 'N' | 'U' | 'B' | 'H' | 'E' | 'D' | 'X' | 'C' | 'F';

/** Canonical emission order (so encode() is deterministic and round-trips byte-for-byte). */
export const BAND_VALUES: readonly Band[] = ['R', 'O', 'Y', 'G', 'U'];
export const CONF_VALUES: readonly Confidence[] = ['H', 'M', 'L'];
export const SOURCE_VALUES: readonly Source[] = ['A', 'W', 'M'];
export const KIND_ORDER: readonly Kind[] = ['C', 'M', 'T', 'B', 'P', 'X'];
export const FLAG_ORDER: readonly Flag[] = ['N', 'U', 'B', 'H', 'E', 'D', 'X', 'C', 'F'];

/** The flat, in-memory form of a DZ-MSD v1 packet (the SMS form is a rendering of this). */
export interface DzmsdPacket {
  /** 5 chars, Crockford base32 (0-9 A-Z without I L O U), client-generated, idempotency key */
  id: string;
  band: Band;
  /** 0..99 — SELLEKNI Severity Index (client-side hint; the server recomputes and is authoritative) */
  score: number;
  conf: Confidence;
  /** WGS84, encoded with 5 decimals (~1.1 m) */
  lat: number;
  lon: number;
  /** Local Algeria time HHMM, "0000".."2359" (the date comes from the SMS / HTTP timestamp) */
  time: string;
  src: Source;
  /** vehicles / persons involved, 0..99 */
  veh: number;
  pers: number;
  /** at least one */
  kinds: Kind[];
  /** estimated speed change, km/h, 0..999 */
  dv?: number;
  /** peak acceleration, g, 0..999 */
  g?: number;
  roll?: boolean;
  flags?: Flag[];
  /** heart rate bpm 0..999, SpO2 % 0..100 */
  hr?: number;
  spo2?: number;
  /** 10-digit Plus Code, e.g. 8F84FRCH+VF (for verbal relay) */
  plus?: string;
}
