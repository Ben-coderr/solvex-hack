/**
 * Sellekni brand constants (docs/06 §11, docs/12 §2). No brand string literal anywhere else in the app: the locale
 * files read these. The codename NAJDA stays in `@najda/*`, `x-najda-key`, env names and file names. The wire
 * magic is NOT here: it is `MAGIC` in @najda/shared and changes only with scripts/rename-magic.mjs.
 * app.json (name, android.package, scheme) mirrors these values; keep them in step.
 */
export const BRAND = {
  name: 'Sellekni',
  codename: 'NAJDA',
  /** JSON `device.app` prefix, seen by the dispatcher in the raw report */
  appId: 'sellekni-mobile',
  /** prefix of the readable SMS to emergency contacts (GSM-7, same as the web's pre-alert prefix) */
  smsName: 'SELLEKNI',
} as const;
