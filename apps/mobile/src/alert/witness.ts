/**
 * Witness mode (M6, docs/03): the 5-tap answers → the packet's scene. Pure, so the mapping is tested without a phone.
 * Same vocabulary as the web witness page (D10): one witness, one `SW` packet, whatever the device.
 */
import { FLAG_LETTER, KIND_LETTER } from '@sellekni/api-contract';
import type { Flag, Kind } from '@sellekni/shared';
import type { WitnessScene } from './packet';

export const WITNESS_KINDS = ['car', 'moto', 'truck', 'bus', 'pedestrian'] as const;
export const WITNESS_STATES = ['unresponsive', 'breathing', 'bleeding'] as const;
export const WITNESS_DANGERS = ['trapped', 'fire', 'child'] as const;

export interface WitnessAnswers {
  /** 3 = "3 or more" */
  vehicles: 1 | 2 | 3;
  kinds: ReadonlyArray<(typeof WITNESS_KINDS)[number]>;
  /** 0 = nobody hurt; 3 = "3 or more" */
  hurt: 0 | 1 | 2 | 3;
  state: ReadonlyArray<(typeof WITNESS_STATES)[number]>;
  danger: ReadonlyArray<(typeof WITNESS_DANGERS)[number]>;
}

export const EMPTY_ANSWERS: WitnessAnswers = { vehicles: 1, kinds: ['car'], hurt: 1, state: [], danger: [] };

export function witnessScene(a: WitnessAnswers): WitnessScene {
  const kinds = [...new Set(a.kinds)].map((k) => KIND_LETTER[k] as Kind);
  const flags = [...new Set([...a.state, ...a.danger])].map((f) => FLAG_LETTER[f] as Flag);
  return { veh: a.vehicles, pers: a.hurt, kinds: kinds.length ? kinds : ['X'], flags };
}

/** Whole minutes since the fix was taken (null = no fix): what the witness and the dispatcher see as "location age". */
export function fixAgeMin(fix: { at: number } | null, now: number): number | null {
  return fix ? Math.max(0, Math.floor((now - fix.at) / 60_000)) : null;
}
