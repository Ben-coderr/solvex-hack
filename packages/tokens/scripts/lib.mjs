import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const tokens = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens.json'), 'utf8'));

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
