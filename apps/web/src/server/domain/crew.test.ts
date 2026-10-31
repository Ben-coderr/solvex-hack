import { describe, expect, it } from 'vitest';
import { assess, gsm7Length, SMS_SINGLE_MAX } from '@sellekni/shared';
import { CREW_RANGES, CrewForm, crewUpdateSms, latestCrew, withCrew } from './crew';
import { formToObject } from './witness';
import { expiringLinkToken, linkToken, verifyExpiringLinkToken } from './links';

const SECRET = 'x'.repeat(40);
const NOW = Date.parse('2026-10-31T10:00:00Z');
const H = 3_600_000;

describe('crew link token (D9): signed and expiring', () => {
  it('verifies before its expiry, says expired after, invalid when forged', () => {
    const k = expiringLinkToken('crew', 'K7Q2M', NOW + 12 * H, SECRET);
    expect(k).toMatch(/^[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    expect(verifyExpiringLinkToken('crew', 'K7Q2M', k, SECRET, NOW)).toMatchObject({ ok: true });
    expect(verifyExpiringLinkToken('crew', 'K7Q2M', k, SECRET, NOW + 12 * H + 1000)).toEqual({ ok: false, why: 'expired' });
    expect(verifyExpiringLinkToken('crew', 'P3N8D', k, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' });
    expect(verifyExpiringLinkToken('crew', 'K7Q2M', k, 'y'.repeat(40), NOW)).toEqual({ ok: false, why: 'invalid' });
    expect(verifyExpiringLinkToken('crew', 'K7Q2M', null, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' });
  });

  it('the expiry cannot be extended by editing it', () => {
    const k = expiringLinkToken('crew', 'K7Q2M', NOW - H, SECRET); // already expired
    const later = (Math.floor((NOW + 24 * H) / 1000)).toString(36);
    expect(verifyExpiringLinkToken('crew', 'K7Q2M', `${later}.${k.split('.')[1]}`, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' });
  });

  it('a witness token never opens the crew page (purpose is signed)', () => {
    const w = linkToken('witness', 'K7Q2M', SECRET);
    expect(verifyExpiringLinkToken('crew', 'K7Q2M', w, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' });
  });
});

describe('crew form (D9)', () => {
  const parse = (q: string) => CrewForm.safeParse(formToObject(new URLSearchParams(q)));

  it('takes the plain HTML form; empty fields mean "not measured"', () => {
    const r = parse('gcs=9&sbp=85&spo2=&hr=&etaMin=12');
    expect(r.success && r.data).toEqual({ gcs: 9, sbp: 85, etaMin: 12 });
  });

  it('refuses an empty form, out-of-range values, decimals and unknown fields', () => {
    expect(parse('gcs=&sbp=&spo2=&hr=&etaMin=').success).toBe(false);
    expect(parse('gcs=2').success).toBe(false);
    expect(parse('gcs=16').success).toBe(false);
    expect(parse('sbp=850').success).toBe(false);
    expect(parse('spo2=101').success).toBe(false);
    expect(parse('hr=9.5').success).toBe(false);
    expect(parse('gcs=9&name=Ali').success).toBe(false);
  });

  it('accepts every range boundary', () => {
    for (const [k, [min, max]] of Object.entries(CREW_RANGES)) {
      expect(parse(`${k}=${min}`).success).toBe(true);
      expect(parse(`${k}=${max}`).success).toBe(true);
    }
  });
});

describe('withCrew: crew values on top of the merged packets', () => {
  it('GCS 9 + SBP 85 (docs/03 flow E) raise a Y case to R', () => {
    const base = { dvKmh: 45, peakG: 16, noResponse: false, flags: [], kinds: ['C' as const], vehicles: 1, persons: 1, independentReports: 1 };
    expect(assess(base).band).not.toBe('R');
    const a = assess(withCrew(base, [{ gcs: 9, sbp: 85 }]));
    expect(a.band).toBe('R');
    expect(a.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['gcs_low', 'sbp_low']));
  });

  it('the latest value of each field wins; a crew SpO₂ replaces the wearable one; ETA is not scored', () => {
    const out = withCrew({ spo2: 89, hr: 124 }, [{ gcs: 9, spo2: 95 }, { gcs: 13, etaMin: 10 }]);
    expect(out).toEqual({ spo2: 95, hr: 124, gcs: 13 });
    expect(latestCrew([{ gcs: 9, spo2: 95 }, { gcs: 13, etaMin: 10 }])).toEqual({ gcs: 13, spo2: 95, etaMin: 10 });
  });
});

describe('crew update SMS to the hospital', () => {
  it('is one basic-GSM-7 SMS even with every field at its widest', () => {
    const msg = crewUpdateSms({ id: 'K7Q2M', band: 'R', nsi: 99, vitals: { gcs: 15, sbp: 300, spo2: 100, hr: 250, etaMin: 240 } });
    expect(gsm7Length(msg)).not.toBeNull();
    expect(gsm7Length(msg)!).toBeLessThanOrEqual(SMS_SINGLE_MAX);
  });

  it('reads like the pre-alert (estimated risk, French, reply code)', () => {
    expect(crewUpdateSms({ id: 'K7Q2M', band: 'R', nsi: 85, vitals: { gcs: 9, sbp: 85, etaMin: 12 } }))
      .toBe('SELLEKNI MAJ EQUIPE K7Q2M risque estime R85. GCS 9, PAS 85. ETA 12min. Repondre OK K7Q2M');
  });
});
