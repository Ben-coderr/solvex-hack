import { describe, expect, it } from 'vitest';
import { packetFromJson } from './json-packet';
import { coarse, linkToken, verifyLinkToken } from './links';
import { formToObject, WitnessForm, witnessJson } from './witness';

const SECRET = 'x'.repeat(40);

describe('witness link token (D10)', () => {
  it('is 22 url-safe chars, stable per id, different per id and per secret', () => {
    const k = linkToken('witness', 'K7Q2M', SECRET);
    expect(k).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(linkToken('witness', 'K7Q2M', SECRET)).toBe(k);
    expect(linkToken('witness', 'K7Q2N', SECRET)).not.toBe(k);
    expect(linkToken('witness', 'K7Q2M', 'y'.repeat(40))).not.toBe(k);
  });

  it('verifies only the exact token for that id', () => {
    const k = linkToken('witness', 'K7Q2M', SECRET);
    expect(verifyLinkToken('witness', 'K7Q2M', k, SECRET)).toBe(true);
    expect(verifyLinkToken('witness', 'P3N8D', k, SECRET)).toBe(false);
    expect(verifyLinkToken('witness', 'K7Q2M', k.slice(0, -1) + (k.endsWith('A') ? 'B' : 'A'), SECRET)).toBe(false);
    expect(verifyLinkToken('witness', 'K7Q2M', null, SECRET)).toBe(false);
    expect(verifyLinkToken('witness', 'K7Q2M', '', SECRET)).toBe(false);
  });

  it('coarse position is ≤ ~100 m (3 decimals)', () => {
    expect(coarse(36.47213)).toBe(36.472);
    expect(coarse(-0.63305)).toBe(-0.633);
  });
});

describe('witness form → v1 JSON → SW packet', () => {
  const form = (q: string) => WitnessForm.safeParse(formToObject(new URLSearchParams(q)));

  it('parses the plain urlencoded form with repeated keys', () => {
    const f = form('vehicles=2&kinds=car&kinds=moto&hurt=1&state=bleeding&danger=trapped&danger=fire&here=yes');
    expect(f.success && f.data).toEqual({
      vehicles: 2, kinds: ['car', 'moto'], hurt: 1, state: ['bleeding'], danger: ['trapped', 'fire'], here: 'yes',
    });
  });

  it('requires the place confirmation, a vehicle count and the hurt count; rejects unknown fields', () => {
    expect(form('vehicles=1&hurt=0').success).toBe(false);
    expect(form('hurt=0&here=yes').success).toBe(false);
    expect(form('vehicles=1&here=yes').success).toBe(false);
    expect(form('vehicles=0&hurt=0&here=yes').success).toBe(false);
    expect(form('vehicles=1&hurt=0&here=yes&name=Karim').success).toBe(false);
    expect(form('vehicles=1&hurt=0&here=yes&kinds=tank').success).toBe(false);
  });

  it('maps to a witness packet at the incident position with its own id', () => {
    const f = WitnessForm.parse({ vehicles: '2', kinds: ['car', 'moto'], hurt: '1', state: 'unresponsive', danger: ['trapped', 'fire', 'child'], here: 'yes' });
    const j = witnessJson(f, { lat: 36.47213, lon: 2.82871 }, new Date('2026-10-30T13:36:00Z'), 'W1TN5');
    const { packet } = packetFromJson(j);
    expect(packet).toMatchObject({
      id: 'W1TN5', src: 'W', veh: 2, pers: 1, kinds: ['C', 'M'], lat: 36.47213, lon: 2.82871, time: '1436',
      flags: ['U', 'X', 'C', 'F'],
    });
  });

  it('no kind ticked → "other"', () => {
    const j = witnessJson(WitnessForm.parse({ vehicles: '1', hurt: '0', here: 'yes' }), { lat: 36, lon: 3 }, new Date(), 'W1TN5');
    expect(j.scene.kinds).toEqual(['other']);
  });
});
