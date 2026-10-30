// Prints a REAL packet built from a detector decision, for the diagrams (docs/diagrams/build_diagrams.py).
import { makeTrace, replay, toPacketHints } from '../src';
import { assess, encodeDzmsd, encodePlusCode, type DzmsdPacket } from '@sellekni/shared';

const R = 16;
const [a] = replay(makeTrace('frontal_45', { rangeG: R, seed: 3, mount: 'tilted' })).decisions;
const h = toPacketHints(a!, R);
const sv = assess({ dvKmh: h.D, peakG: h.G, rollover: h.RO, noResponse: true, kinds: ['C'], vehicles: 1, persons: 1 });
const pkt: DzmsdPacket = {
  id: 'K7Q2M', band: sv.band, score: sv.score, conf: sv.conf, lat: 36.47213, lon: 2.82871, time: '1432', src: 'A',
  veh: 1, pers: 1, kinds: ['C'], dv: h.D, g: h.G, roll: h.RO, flags: ['N'], plus: encodePlusCode(36.47213, 2.82871),
};
console.log(JSON.stringify({ wire: encodeDzmsd(pkt), hints: h, band: sv.band, score: sv.score, conf: sv.conf, reasons: a!.reasons }));
