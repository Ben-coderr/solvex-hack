/**
 * Sellekni brand constants (docs/06 §11, docs/12 §2). No brand string literal anywhere else in the web app.
 * Same name in code (`@sellekni/*`, `x-sellekni-key`); the old codename NAJDA is retired. The wire magic is NOT here:
 * it is `MAGIC` in @sellekni/shared and changes only with scripts/rename-magic.mjs (the CRC covers it).
 */
export const BRAND = {
  name: 'Sellekni',
  /** outbound SMS start with this (basic GSM-7, capitals, no accents) */
  smsName: 'SELLEKNI',
  /** inbound SMS verbs, e.g. `SLK ACK K7Q2M`, `SLK STATUS CHU-A SAT` */
  smsVerb: 'SLK',
} as const;
