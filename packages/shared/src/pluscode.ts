/**
 * Minimal, dependency-free Open Location Code (Plus Code) — 10-digit codes only
 * (~14 m x 14 m cells), which is all DZ-MSD needs. Cross-checked against the
 * reference `open-location-code` package in test/pluscode.test.ts.
 */
const ALPHABET = '23456789CFGHJMPQRVWX';
const BASE = 20;
const LAT_UNITS_PER_DEG = 8000; // final resolution: 1/8000 degree for 10 digits
const LON_UNITS_PER_DEG = 8000;

export const PLUS_CODE_RE = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$/;

export function encodePlusCode(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new RangeError('encodePlusCode: non-finite input');
  let la = Math.min(90, Math.max(-90, lat));
  if (la === 90) la -= 1 / LAT_UNITS_PER_DEG; // keep strictly < 90 so it can be decoded
  let lo = lon;
  while (lo < -180) lo += 360;
  while (lo >= 180) lo -= 360;

  // Integer arithmetic (rounded at 1e-6 of a cell to kill float noise, as the reference lib does).
  let latVal = Math.floor(Math.round((la + 90) * LAT_UNITS_PER_DEG * 1e6) / 1e6);
  let lonVal = Math.floor(Math.round((lo + 180) * LON_UNITS_PER_DEG * 1e6) / 1e6);

  let code = '';
  for (let i = 0; i < 5; i++) {
    code = ALPHABET[lonVal % BASE]! + code;
    code = ALPHABET[latVal % BASE]! + code;
    latVal = Math.floor(latVal / BASE);
    lonVal = Math.floor(lonVal / BASE);
  }
  return code.slice(0, 8) + '+' + code.slice(8);
}

export interface PlusCodeArea {
  latLo: number; lonLo: number; latHi: number; lonHi: number; latCenter: number; lonCenter: number;
}

export function decodePlusCode(code: string): PlusCodeArea {
  if (!PLUS_CODE_RE.test(code)) throw new RangeError(`decodePlusCode: not a full 10-digit plus code: ${code}`);
  const digits = code.replace('+', '');
  let latUnits = 0;
  let lonUnits = 0;
  for (let i = 0; i < 5; i++) {
    latUnits = latUnits * BASE + ALPHABET.indexOf(digits[2 * i]!);
    lonUnits = lonUnits * BASE + ALPHABET.indexOf(digits[2 * i + 1]!);
  }
  const latLo = latUnits / LAT_UNITS_PER_DEG - 90;
  const lonLo = lonUnits / LON_UNITS_PER_DEG - 180;
  const latHi = latLo + 1 / LAT_UNITS_PER_DEG;
  const lonHi = lonLo + 1 / LON_UNITS_PER_DEG;
  return { latLo, lonLo, latHi, lonHi, latCenter: (latLo + latHi) / 2, lonCenter: (lonLo + lonHi) / 2 };
}
