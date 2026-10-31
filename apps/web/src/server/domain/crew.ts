import { z } from 'zod';
import type { AssessmentInput, Band } from '@sellekni/shared';
import { BRAND } from '../../brand';

/**
 * D9 crew update (docs/05 §2.1): GCS, SBP, SpO₂, HR, ETA typed by the ambulance crew on `/crew/[id]?k=`.
 * Plain urlencoded form (gloves, any phone, no JS) or JSON; an empty field means "not measured".
 */
export const CREW_LINK_TTL_MS = 12 * 3_600_000; // one shift: long enough for any mission, short enough to die with it

/** Plausible ranges, not clinical thresholds: they only reject typos (SBP 850, SpO₂ 899). */
export const CREW_RANGES = {
  gcs: [3, 15],
  sbp: [40, 300],
  spo2: [50, 100],
  hr: [20, 250],
  etaMin: [0, 240],
} as const;

const field = ([min, max]: readonly [number, number]) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? Number(v.trim()) : v),
    z.number().int().min(min).max(max).optional(),
  );

export const CrewForm = z
  .object({
    gcs: field(CREW_RANGES.gcs),
    sbp: field(CREW_RANGES.sbp),
    spo2: field(CREW_RANGES.spo2),
    hr: field(CREW_RANGES.hr),
    etaMin: field(CREW_RANGES.etaMin),
  })
  .strict()
  .refine((f) => Object.values(f).some((v) => v !== undefined), { message: 'at least one value', path: ['empty'] });
export type CrewVitals = z.infer<typeof CrewForm>;

/**
 * Crew values on top of the merged packets: each field takes the LATEST crew value present (same rule as packet
 * vitals, docs/05 §4), and a crew-measured SpO₂/HR replaces the phone's wearable value. ETA is not scored.
 */
export function withCrew(input: AssessmentInput, updates: readonly CrewVitals[]): AssessmentInput {
  const out = { ...input };
  for (const u of updates) {
    if (u.gcs !== undefined) out.gcs = u.gcs;
    if (u.sbp !== undefined) out.sbp = u.sbp;
    if (u.spo2 !== undefined) out.spo2 = u.spo2;
    if (u.hr !== undefined) out.hr = u.hr;
  }
  return out;
}

/** The latest crew value of each field, for pre-filling the form and the hospital card. */
export function latestCrew(updates: readonly CrewVitals[]): CrewVitals {
  const out: CrewVitals = {};
  for (const u of updates) for (const [k, v] of Object.entries(u)) if (v !== undefined) out[k as keyof CrewVitals] = v;
  return out;
}

/**
 * Hospital SMS after a crew update, one SMS of basic GSM-7 (same wording rules as the pre-alert):
 * SELLEKNI MAJ EQUIPE K7Q2M risque estime R85. GCS 9, PAS 85, SpO2 89, FC 124. ETA 12min. Repondre OK K7Q2M
 * The ranges cap it at ~110 characters (pinned by a test), so it never needs trimming.
 */
export function crewUpdateSms(f: { id: string; band: Band; nsi: number; vitals: CrewVitals }): string {
  const v = f.vitals;
  const parts = [
    v.gcs !== undefined && `GCS ${v.gcs}`,
    v.sbp !== undefined && `PAS ${v.sbp}`,
    v.spo2 !== undefined && `SpO2 ${v.spo2}`,
    v.hr !== undefined && `FC ${v.hr}`,
  ].filter(Boolean);
  return (
    `${BRAND.smsName} MAJ EQUIPE ${f.id} risque estime ${f.band}${String(f.nsi).padStart(2, '0')}.` +
    (parts.length ? ` ${parts.join(', ')}.` : '') +
    (v.etaMin !== undefined ? ` ETA ${v.etaMin}min.` : '') +
    ` Repondre OK ${f.id}`
  );
}
