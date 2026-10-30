/**
 * Sellekni brand constants (docs/06 §11, docs/12 §2). No brand string literal anywhere else in the web app.
 * The codename NAJDA stays in `@najda/*`, `x-najda-key`, env names and file names. The wire magic is NOT here:
 * it is `MAGIC` in @najda/shared and changes only with scripts/rename-magic.mjs (the CRC covers it).
 */
export const BRAND = {
  name: 'Sellekni',
  codename: 'NAJDA',
  /** outbound SMS start with this (basic GSM-7, capitals, no accents) */
  smsName: 'SELLEKNI',
  /** inbound SMS verbs, e.g. `SLK ACK K7Q2M`, `SLK STATUS CHU-A SAT` */
  smsVerb: 'SLK',
} as const;
