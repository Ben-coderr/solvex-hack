/**
 * NAJDA Severity Index (NSI) — transparent, explainable, UNCALIBRATED decision support.
 *
 * Inputs and their direction follow the 2021 ACS/NHTSA Field Triage Guideline (red/yellow criteria)
 * and AACN/URGENCY crash-physics literature (delta-v, rollover, multiple impacts).
 * ALL WEIGHTS ARE ASSUMPTIONS and need clinical calibration. Humans always decide.
 *
 * Design rules (see docs/05-PROTOCOL-SCORING-RANKING.md):
 *  1. Server-authoritative: the phone's band/score is a hint; the server recomputes with this module.
 *  2. Vittel-style two-step logic: PHYSIOLOGY can force band R; MECHANISM alone is capped at O.
 *  3. Every output carries its reasons, confidence and a fixed disclaimer.
 */
import type { Band, Confidence, DzmsdPacket, Flag, Kind } from './types';

export const ENGINE_VERSION = 'nsi-1.0.0';
export const DISCLAIMER = 'Estimated risk, not a diagnosis. Confirm by call-back.';
export const PHYSICS_CAP = 50;
export const SCORE_SCALE = 60; // score = round(99 * (1 - exp(-raw / 60)))

export interface AssessmentInput {
  // — sensor-derived (phone) —
  dvKmh?: number;
  peakG?: number;
  rollover?: boolean;
  multiImpact?: boolean;
  /** countdown expired with no response (flag N) */
  noResponse?: boolean;
  // — scene (witness / driver) —
  flags?: Flag[];
  kinds?: Kind[];
  vehicles?: number;
  persons?: number;
  // — vitals (BLE wearable, or crew-entered on the web channel) —
  spo2?: number;
  hr?: number;
  /** Glasgow Coma Scale 3..15 (crew-entered, JSON channel only) */
  gcs?: number;
  /** systolic blood pressure mmHg (crew-entered, JSON channel only) */
  sbp?: number;
  // — optional consented profile —
  age?: number;
  pregnant?: boolean;
  anticoagulant?: boolean;
  // — confirmations —
  /** user pressed "I'm OK" or a witness confirmed no injuries (only way to reach band G) */
  confirmedOk?: boolean;
  /** number of independent reports merged into this incident (each extra one raises confidence) */
  independentReports?: number;
}

export type ReasonGroup = 'sensor' | 'scene' | 'vitals' | 'profile';
export type ResourceHint = 'extrication' | 'fire' | 'mci';

export interface Reason {
  /** stable key for i18n (ar/fr/en) in the UI */
  code: string;
  /** English fallback text */
  text: string;
  points: number;
  group: ReasonGroup;
  /** RED criterion: forces band R */
  red: boolean;
  /** counted inside the physics subtotal (capped at 50) */
  physics: boolean;
}

export interface Assessment {
  band: Band;
  score: number;
  conf: Confidence;
  rawPoints: number;
  physicsPoints: number;
  physicsCapped: boolean;
  /** top 3 reasons by points */
  reasons: Reason[];
  /** every contribution (points > 0, or red with 0 points) in evaluation order */
  contributions: Reason[];
  redCriteria: string[];
  /** set when mechanism-only evidence was capped at band O */
  capNote?: string;
  resourceHints: ResourceHint[];
  disclaimer: string;
  engineVersion: string;
}

export const scoreFromRaw = (raw: number): number =>
  Math.min(99, Math.max(0, Math.round(99 * (1 - Math.exp(-raw / SCORE_SCALE)))));

const has = <T>(arr: readonly T[] | undefined, x: T): boolean => !!arr && arr.includes(x);

function collect(i: AssessmentInput): Reason[] {
  const out: Reason[] = [];
  const add = (r: Omit<Reason, 'red' | 'physics'> & { red?: boolean; physics?: boolean }) => {
    out.push({ red: false, physics: false, ...r });
  };

  // — physics (subtotal capped at 50) —
  if (i.dvKmh !== undefined) {
    const p = i.dvKmh >= 60 ? 30 : i.dvKmh >= 40 ? 20 : i.dvKmh >= 25 ? 10 : 0;
    if (p) add({ code: 'dv', text: `Speed drop ~${Math.round(i.dvKmh)} km/h`, points: p, group: 'sensor', physics: true });
  }
  if (i.peakG !== undefined && i.peakG >= 20) {
    add({ code: 'peak_g', text: `Impact peak ${Math.round(i.peakG)} g`, points: 5, group: 'sensor', physics: true });
  }
  if (i.rollover) add({ code: 'rollover', text: 'Rollover detected', points: 15, group: 'sensor', physics: true });
  if (i.multiImpact) add({ code: 'multi_impact', text: 'Multiple impacts', points: 5, group: 'sensor', physics: true });

  // — no response to the countdown (sensor channel, outside the physics cap) —
  if (i.noResponse || has(i.flags, 'N')) {
    add({ code: 'no_response', text: 'No response to the safety countdown', points: 15, group: 'sensor' });
  }

  // — witness / scene —
  if (has(i.flags, 'U')) add({ code: 'unresponsive', text: 'Person not responding', points: 25, group: 'scene', red: true });
  if (has(i.flags, 'B')) add({ code: 'breathing', text: 'Breathing difficulty', points: 20, group: 'scene', red: true });
  if (has(i.flags, 'H')) add({ code: 'bleeding', text: 'Heavy bleeding', points: 20, group: 'scene', red: true });
  if (has(i.flags, 'E')) add({ code: 'ejected', text: 'Person ejected from vehicle', points: 20, group: 'scene' });
  if (has(i.flags, 'D')) add({ code: 'death_in_vehicle', text: 'Death reported in same vehicle', points: 20, group: 'scene' });
  if (has(i.flags, 'X')) add({ code: 'trapped', text: 'Person trapped — extrication needed', points: 15, group: 'scene' });
  if (has(i.flags, 'C')) add({ code: 'child', text: 'Child involved', points: 10, group: 'scene' });
  if (has(i.kinds, 'P') || has(i.kinds, 'M')) {
    const both = has(i.kinds, 'P') && has(i.kinds, 'M');
    add({
      code: 'vulnerable_user',
      text: both ? 'Pedestrian and motorcycle involved' : has(i.kinds, 'P') ? 'Pedestrian involved' : 'Motorcycle involved',
      points: 10, group: 'scene',
    });
  }

  // — vitals —
  if (i.spo2 !== undefined && i.spo2 < 90) {
    add({ code: 'spo2_low', text: `SpO2 ${Math.round(i.spo2)}%`, points: 20, group: 'vitals', red: true });
  }
  if (i.hr !== undefined && (i.hr > 130 || i.hr < 50)) {
    add({ code: 'hr_abnormal', text: `Heart rate ${Math.round(i.hr)} bpm`, points: 15, group: 'vitals' });
  }
  // GCS / SBP: crew-entered; point values are ASSUMPTIONS (the SMS packet carries neither).
  if (i.gcs !== undefined && i.gcs < 13) {
    add({ code: 'gcs_low', text: `Glasgow Coma Scale ${Math.round(i.gcs)}`, points: 25, group: 'vitals', red: true });
  }
  if (i.sbp !== undefined && i.sbp < 90) {
    add({ code: 'sbp_low', text: `Systolic BP ${Math.round(i.sbp)} mmHg`, points: 20, group: 'vitals', red: true });
  }

  // — consented profile modifiers (EMS-judgement) —
  if (i.age !== undefined && i.age >= 65) add({ code: 'age_65', text: 'Age 65 or over', points: 5, group: 'profile' });
  if (i.pregnant) add({ code: 'pregnant', text: 'Pregnancy', points: 5, group: 'profile' });
  if (i.anticoagulant) add({ code: 'anticoagulant', text: 'On anticoagulants', points: 5, group: 'profile' });

  return out;
}

function confidence(contribs: Reason[], independentReports: number): Confidence {
  const count = (g: ReasonGroup) => contribs.filter((c) => c.group === g && c.points > 0).length;
  const groups = (['sensor', 'scene', 'vitals'] as const).map((g) => ({ g, n: count(g) }));
  const active = groups.filter((x) => x.n >= 1).length;
  let level = active >= 2 ? 2 : groups.some((x) => x.n >= 3) ? 1 : 0; // 2=H 1=M 0=L
  level = Math.min(2, level + Math.min(2, Math.max(0, independentReports - 1)));
  return (['L', 'M', 'H'] as const)[level]!;
}

export function resourceHintsFor(i: Pick<AssessmentInput, 'flags' | 'kinds' | 'persons'>): ResourceHint[] {
  const hints: ResourceHint[] = [];
  if (has(i.flags, 'X')) hints.push('extrication');
  if (has(i.flags, 'F')) hints.push('fire');
  if ((i.persons ?? 0) >= 5 || (has(i.kinds, 'B') && (i.persons ?? 0) >= 3)) hints.push('mci');
  return hints;
}

export interface AssessOptions {
  /** Vittel-style rule: mechanism-only evidence cannot reach band R. Default true. */
  capMechanismOnly?: boolean;
}

export function assess(input: AssessmentInput, opts: AssessOptions = {}): Assessment {
  const capMechanismOnly = opts.capMechanismOnly ?? true;
  const contributions = collect(input);
  const physicsRaw = contributions.filter((c) => c.physics).reduce((s, c) => s + c.points, 0);
  const physicsPoints = Math.min(PHYSICS_CAP, physicsRaw);
  const other = contributions.filter((c) => !c.physics).reduce((s, c) => s + c.points, 0);
  const rawPoints = physicsPoints + other;
  const score = scoreFromRaw(rawPoints);

  const redCriteria = contributions.filter((c) => c.red).map((c) => c.code);
  // Physiological evidence = RED criteria, no response to the countdown, or abnormal heart rate.
  const physiological =
    redCriteria.length > 0 || contributions.some((c) => c.code === 'no_response' || c.code === 'hr_abnormal');

  let band: Band;
  let capNote: string | undefined;
  if (redCriteria.length > 0) band = 'R';
  else if (score >= 70 && (physiological || !capMechanismOnly)) band = 'R';
  else if (score >= 70) {
    band = 'O';
    capNote = 'Mechanism-only evidence is capped at O (serious) until physiological signs are reported.';
  } else if (score >= 45) band = 'O';
  else if (score >= 20) band = 'Y';
  else band = input.confirmedOk ? 'G' : 'U';

  const reasons = [...contributions]
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => b.c.points - a.c.points || a.idx - b.idx)
    .slice(0, 3)
    .map((x) => x.c);

  return {
    band, score,
    conf: confidence(contributions, input.independentReports ?? 1),
    rawPoints, physicsPoints, physicsCapped: physicsRaw > PHYSICS_CAP,
    reasons, contributions, redCriteria,
    ...(capNote && { capNote }),
    resourceHints: resourceHintsFor(input),
    disclaimer: DISCLAIMER,
    engineVersion: ENGINE_VERSION,
  };
}

/** Rebuild assessment inputs from a decoded SMS packet (what the server can know from 160 chars). */
export function inputFromPacket(p: DzmsdPacket, extra: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    ...(p.dv !== undefined && { dvKmh: p.dv }),
    ...(p.g !== undefined && { peakG: p.g }),
    ...(p.roll && { rollover: true }),
    ...(p.flags && { flags: p.flags }),
    kinds: p.kinds,
    vehicles: p.veh,
    persons: p.pers,
    ...(p.hr !== undefined && { hr: p.hr }),
    ...(p.spo2 !== undefined && { spo2: p.spo2 }),
    ...extra,
  };
}
