import { decodeDzmsd, encodeDzmsd, gsm7Length, SMS_SINGLE_MAX, type DzmsdPacket } from '@najda/shared';
import vectors from '@najda/shared/test-vectors/dzmsd-valid.json';

// P0 smoke check only: golden case "spec-example-1" (docs/05 §1.2), encoded by the shared package at render time.
const golden = vectors.cases[0]!;

export function smokePacket() {
  const wire = encodeDzmsd(golden.packet as DzmsdPacket);
  return {
    wire,
    length: gsm7Length(wire),
    max: SMS_SINGLE_MAX,
    roundTrip: decodeDzmsd(wire).ok,
    matchesGolden: wire === golden.wire,
  };
}
