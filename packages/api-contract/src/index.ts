/**
 * @najda/api-contract — the JSON channel between the phone, the web pages and the API (docs/05 §2).
 * Schemas + types only. Protocol logic (encode/decode/assess/rank/merge) lives in @najda/shared.
 */
import { z } from 'zod';

// ───────────────────────── vocabulary ─────────────────────────

/** Crockford base32 id, same alphabet as the DZ-MSD packet id (no I L O U). */
export const IncidentId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{5}$/, 'incident_id: 5 Crockford base32 chars');
export type IncidentId = z.infer<typeof IncidentId>;

export const SOURCES = ['auto', 'witness', 'sos'] as const;
export const KINDS = ['car', 'moto', 'truck', 'bus', 'pedestrian', 'other'] as const;
export const FLAGS = [
  'no_response', 'unresponsive', 'breathing', 'bleeding', 'ejected', 'death_in_vehicle', 'trapped', 'child', 'fire',
] as const;

/** JSON word → DZ-MSD letter. The packet letters are defined in docs/05 §1.1. */
export const SOURCE_LETTER = { auto: 'A', witness: 'W', sos: 'M' } as const satisfies Record<(typeof SOURCES)[number], string>;
export const KIND_LETTER = {
  car: 'C', moto: 'M', truck: 'T', bus: 'B', pedestrian: 'P', other: 'X',
} as const satisfies Record<(typeof KINDS)[number], string>;
export const FLAG_LETTER = {
  no_response: 'N', unresponsive: 'U', breathing: 'B', bleeding: 'H', ejected: 'E',
  death_in_vehicle: 'D', trapped: 'X', child: 'C', fire: 'F',
} as const satisfies Record<(typeof FLAGS)[number], string>;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

// ───────────────────────── POST /api/incidents ─────────────────────────

export const IncidentJson = z
  .object({
    v: z.literal(1),
    incident_id: IncidentId,
    source: z.enum(SOURCES),
    /** ISO 8601 with offset, e.g. 2026-10-30T14:32:07+01:00 */
    created_at: z.iso.datetime({ offset: true }),
    location: z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      acc_m: z.number().nonnegative().optional(),
      heading: z.number().min(0).max(360).optional(),
      plus_code: z.string().max(16).optional(),
    }),
    crash: z
      .object({
        dv_kmh: int(0, 999).optional(),
        peak_g: int(0, 999).optional(),
        rollover: z.boolean().optional(),
        multi_impact: z.boolean().optional(),
        no_response: z.boolean().optional(),
      })
      .optional(),
    scene: z.object({
      vehicles: int(0, 99),
      persons: int(0, 99),
      kinds: z.array(z.enum(KINDS)).min(1),
      flags: z.array(z.enum(FLAGS)).default([]),
      fire: z.boolean().optional(),
    }),
    vitals: z
      .object({
        hr: int(0, 999).optional(),
        spo2: int(0, 100).optional(),
        source: z.string().max(32).optional(),
      })
      .optional(),
    /** Accepted only with consent; stored apart with short retention; never logged, never sent by SMS. */
    medical: z
      .object({
        blood: z.string().max(4).optional(),
        anticoagulant: z.boolean().optional(),
        allergies: z.array(z.string().max(40)).max(10).optional(),
        consent: z.literal(true),
      })
      .optional(),
    contact: z
      .object({
        callback: z.string().regex(/^\+?[0-9]{6,15}$/).optional(),
        lang: z.enum(['ar', 'fr', 'en']).optional(),
      })
      .optional(),
    device: z
      .object({
        app: z.string().max(32).optional(),
        battery: int(0, 100).optional(),
      })
      .optional(),
    /** The phone's own estimate (a HINT kept for audit; the server recomputes). */
    hint: z
      .object({
        band: z.enum(['R', 'O', 'Y', 'G', 'U']),
        score: int(0, 99),
        conf: z.enum(['H', 'M', 'L']),
      })
      .optional(),
  })
  .strict();
export type IncidentJson = z.infer<typeof IncidentJson>;

// ───────────────────────── crew update (stretch, JSON only) ─────────────────────────

export const CrewUpdate = z
  .object({
    gcs: int(3, 15).optional(),
    sbp: int(0, 300).optional(),
    spo2: int(0, 100).optional(),
    hr: int(0, 300).optional(),
    eta_min: int(0, 600).optional(),
  })
  .strict()
  .refine((u) => Object.values(u).some((v) => v !== undefined), 'at least one value');
export type CrewUpdate = z.infer<typeof CrewUpdate>;

// ───────────────────────── responses ─────────────────────────

export const AssessmentSummary = z.object({
  version: z.number().int(),
  band: z.enum(['R', 'O', 'Y', 'G', 'U']),
  nsi: int(0, 99),
  conf: z.enum(['H', 'M', 'L']),
  reasons: z.array(z.object({ code: z.string(), text: z.string(), points: z.number() })),
  cap_note: z.string().optional(),
  disclaimer: z.string(),
  engine_version: z.string(),
});
export type AssessmentSummary = z.infer<typeof AssessmentSummary>;

/**
 * created  — new incident · merged — joined an existing incident as an independent report
 * updated  — same packet id re-sent with new content · duplicate — exact re-delivery, nothing changed
 * unparsed — stored raw, shown to the dispatcher, no incident
 */
export const IngestOutcome = z.enum(['created', 'merged', 'updated', 'duplicate', 'unparsed']);
export type IngestOutcome = z.infer<typeof IngestOutcome>;

export const IngestAck = z.object({
  outcome: IngestOutcome,
  report_id: z.string(),
  incident_id: IncidentId.nullable(),
  merged_count: z.number().int().nullable(),
  assessment: AssessmentSummary.nullable(),
  /** parse error code when outcome = unparsed */
  error: z.string().nullable(),
  received_at: z.string(),
});
export type IngestAck = z.infer<typeof IngestAck>;

export const Health = z.object({
  ok: z.literal(true),
  time: z.string(),
  version: z.string(),
  demo: z.boolean(),
  /** the offline basemap is installed on the server (dashboard map works without internet) */
  offlineTiles: z.boolean().optional(),
});
export type Health = z.infer<typeof Health>;

export const ApiError = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof ApiError>;
