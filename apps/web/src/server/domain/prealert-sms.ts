import { SMS_SINGLE_MAX, gsm7Length, type Band, type Flag } from '@najda/shared';
import { BRAND } from '../../brand';

export interface PrealertFacts {
  id: string;
  band: Band;
  nsi: number;
  etaMin: number | null;
  persons?: number | undefined;
  rollover?: boolean | undefined;
  dvKmh?: number | undefined;
  spo2?: number | undefined;
  hr?: number | undefined;
  flags?: readonly Flag[] | undefined;
}

/** Observations as reported (French, no accents: pure GSM-7). Never a diagnosis. */
const FLAG_FR: Record<Flag, string> = {
  N: 'pas de reponse', U: 'ne repond pas', B: 'difficulte a respirer', H: 'saignement important',
  E: 'ejecte', D: 'deces dans le vehicule', X: 'incarcere', C: 'enfant implique', F: 'feu',
};
/** Most decision-relevant first; details are dropped from the end to fit one SMS. */
const FLAG_PRIORITY: readonly Flag[] = ['U', 'B', 'H', 'N', 'X', 'E', 'D', 'C', 'F'];

/**
 * Hospital pre-alert, one SMS of BASIC GSM-7 only (docs/04 §6 template, minus its `~`, an extension char;
 * "estimated risk" wording per najda-medical-language):
 * SELLEKNI PRE-ALERTE K7Q2M risque estime R75 ETA 24min. 1 pers. Tonneau, dv 71km/h, SpO2 89, pas de reponse. Repondre OK K7Q2M
 */
export function prealertSms(f: PrealertFacts): string {
  const head = `${BRAND.smsName} PRE-ALERTE ${f.id} risque estime ${f.band}${String(f.nsi).padStart(2, '0')}` +
    (f.etaMin !== null ? ` ETA ${Math.round(f.etaMin)}min.` : '.');
  const tail = ` Repondre OK ${f.id}`;
  const details: string[] = [];
  if (f.rollover) details.push('Tonneau');
  if (f.dvKmh !== undefined) details.push(`dv ${f.dvKmh}km/h`);
  if (f.spo2 !== undefined) details.push(`SpO2 ${f.spo2}`);
  for (const fl of FLAG_PRIORITY) if (f.flags?.includes(fl)) details.push(FLAG_FR[fl]);
  if (f.hr !== undefined) details.push(`FC ${f.hr}`);

  const persons = f.persons !== undefined ? ` ${f.persons} pers.` : '';
  const fits = (s: string) => (gsm7Length(s) ?? Infinity) <= SMS_SINGLE_MAX;
  for (let n = details.length; n >= 0; n--) {
    const body = n ? ` ${details.slice(0, n).join(', ')}.` : '';
    const msg = head + persons + body + tail;
    if (fits(msg)) return msg;
  }
  return head + tail; // ids and numbers are always GSM-7 and short
}
