/**
 * CRC-8 (poly 0x07, init 0x00, no reflection, no final xor) — a.k.a. CRC-8/SMBUS.
 * Standard check value: crc8("123456789") === 0xF4.
 *
 * SECURITY NOTE: this is an INTEGRITY check against typos / SMS corruption.
 * It is NOT authentication. Anyone can forge a valid CRC. See docs/11-CORRECTIONS-AND-RISKS.md.
 */
const TABLE: Uint8Array = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();

/** CRC-8 over an ASCII string (throws on any char > 0x7F: the wire format is ASCII only). */
export function crc8(input: string): number {
  let c = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code > 0x7f) throw new RangeError(`crc8: non-ASCII character at index ${i}`);
    c = TABLE[(c ^ code) & 0xff]!;
  }
  return c;
}

/** Two-digit uppercase hex, e.g. 4 -> "04". */
export function crc8Hex(input: string): string {
  return crc8(input).toString(16).toUpperCase().padStart(2, '0');
}
