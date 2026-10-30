import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gsm7Length, isGsm7Basic } from '@najda/shared';
import { checkTransition, STATUSES, TRANSITIONS } from '../../domain/lifecycle';
import { prealertSms } from '../../domain/prealert-sms';
import { cellKey, getEtas, parseMatrix, type Eta, type EtaCache } from '../routing';
import { RateLimiter } from '../rate-limit';
import { parseInbound, sendSms, signBody, verifySignature } from '../sms/gateway';
import { ingest } from '../ingest';
import { MemoryStore } from './memory-store';

describe('lifecycle', () => {
  it('is a forward-only chain with cancel, and terminal states are final', () => {
    expect(checkTransition('RECEIVED', 'ACKNOWLEDGED')).toEqual({ ok: true });
    expect(checkTransition('RECEIVED', 'DISPATCHED')).toMatchObject({ ok: false, why: 'RECEIVED can only move to ACKNOWLEDGED or CANCELLED' });
    expect(checkTransition('CLOSED', 'RECEIVED')).toMatchObject({ ok: false, why: 'CLOSED is final' });
    expect(checkTransition('ON_SCENE', 'ON_SCENE')).toMatchObject({ ok: false });
    for (const s of STATUSES) expect(TRANSITIONS[s]).not.toContain('MERGED');
  });
  it('cancelling (false alarm) needs a reason', () => {
    expect(checkTransition('RECEIVED', 'CANCELLED')).toMatchObject({ ok: false });
    expect(checkTransition('RECEIVED', 'CANCELLED', '  ok ')).toMatchObject({ ok: false });
    expect(checkTransition('RECEIVED', 'CANCELLED', 'call-back: driver fine')).toEqual({ ok: true });
  });
});

describe('pre-alert SMS', () => {
  it('matches the docs/04 §6 template with estimated-risk wording', () => {
    const s = prealertSms({ id: 'K7Q2M', band: 'R', nsi: 75, etaMin: 24, persons: 1, rollover: true, dvKmh: 71, spo2: 89, flags: ['N'] });
    expect(s).toBe('SELLEKNI PRE-ALERTE K7Q2M risque estime R75 ETA 24min. 1 pers. Tonneau, dv 71km/h, SpO2 89, pas de reponse. Repondre OK K7Q2M');
    expect(isGsm7Basic(s)).toBe(true);
  });
  it('always fits one GSM-7 SMS and keeps the reply instruction, even with every flag', () => {
    const s = prealertSms({
      id: 'ZZZZZ', band: 'R', nsi: 99, etaMin: 88, persons: 99, rollover: true, dvKmh: 999, spo2: 70, hr: 190,
      flags: ['N', 'U', 'B', 'H', 'E', 'D', 'X', 'C', 'F'],
    });
    expect(isGsm7Basic(s)).toBe(true);
    expect(gsm7Length(s)!).toBeLessThanOrEqual(160);
    expect(s.endsWith('Repondre OK ZZZZZ')).toBe(true);
    expect(s).toContain('ne repond pas'); // highest-priority observation survives truncation
  });
  it('says nothing about ETA when unknown', () => {
    expect(prealertSms({ id: 'AAAAA', band: 'Y', nsi: 5, etaMin: null })).toBe('SELLEKNI PRE-ALERTE AAAAA risque estime Y05. Repondre OK AAAAA');
  });
});

describe('routing chain', () => {
  const origin = { lat: 36.47213, lon: 2.82871 };
  const dests = [{ id: 'A', lat: 36.5, lon: 2.9 }, { id: 'B', lat: 36.6, lon: 3.0 }];
  const osrmOk = { code: 'Ok', durations: [[0, 600, null]], distances: [[0, 9000, null]] };
  const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('cell key is a ~100 m grid', () => {
    expect(cellKey(origin)).toBe('36.472,2.829');
    expect(cellKey({ lat: 36.47249, lon: 2.82871 })).toBe(cellKey(origin));
  });
  it('parses row 0, rounds minutes up, skips unroutable', () => {
    expect(parseMatrix(osrmOk, dests, 'osrm', 'm')).toEqual({ A: { minutes: 10, km: 9, source: 'osrm' } });
    expect(parseMatrix({ durations: [[0, 61]] }, dests.slice(0, 1), 'ors', 'km')).toEqual({ A: { minutes: 2, km: null, source: 'ors' } });
  });
  it('OSRM → ORS for what OSRM could not route → the rest left to haversine; sources kept; routed results cached', async () => {
    const calls: string[] = [];
    const fake = (async (url: string | URL | Request) => {
      calls.push(String(url).includes('openrouteservice') ? 'ors' : 'osrm');
      return String(url).includes('openrouteservice') ? res({ durations: [[0, 1200]], distances: [[0, 18]] }) : res(osrmOk);
    }) as typeof fetch;
    const stored: Record<string, Eta> = {};
    const cache: EtaCache = { get: async () => ({}), put: async (_k, e) => void Object.assign(stored, e) };
    const r = await getEtas(origin, dests, { osrmUrl: 'http://osrm', orsKey: 'k', fetch: fake }, cache);
    expect(calls).toEqual(['osrm', 'ors']);
    expect(r.etas).toEqual({ A: { minutes: 10, km: 9, source: 'osrm' }, B: { minutes: 20, km: 18, source: 'ors' } });
    expect(stored).toEqual(r.etas);
  });
  it('never blocks: providers down or unconfigured → empty routed set and honest notes', async () => {
    const down = (async () => { throw new Error('osrm: connect ECONNREFUSED'); }) as typeof fetch;
    const r = await getEtas(origin, dests, { osrmUrl: 'http://osrm', fetch: down });
    expect(r.etas).toEqual({});
    expect(r.notes).toEqual(['osrm: connect ECONNREFUSED', 'ors: not configured', 'haversine x1.4 for 2 facilities']);
  });
  it('times out a hanging provider', async () => {
    const hang = ((_u: unknown, init?: RequestInit) =>
      new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('osrm: timeout'))))) as typeof fetch;
    const r = await getEtas(origin, dests, { osrmUrl: 'http://osrm', fetch: hang, timeoutMs: 20 });
    expect(r.notes[0]).toBe('osrm: timeout');
  });
});

describe('SMS gateway', () => {
  const fixture = JSON.parse(readFileSync(new URL('../sms/fixtures/sms-received.docs.json', import.meta.url), 'utf8'));
  const now = new Date('2026-10-30T13:35:00Z');

  it('parses the documented sms:received payload', () => {
    expect(parseInbound(fixture, now)).toEqual({
      kind: 'sms', from: '+213555000001', text: fixture.payload.message,
      receivedAt: new Date('2026-10-30T13:33:05Z'), messageId: 'abc123',
    });
  });
  it('accepts the older field name, ignores other events, rejects junk', () => {
    const alt = { event: 'sms:received', payload: { phoneNumber: '+2135', message: 'x' } };
    expect(parseInbound(alt, now)).toMatchObject({ kind: 'sms', from: '+2135' });
    expect(parseInbound({ event: 'sms:delivered', payload: {} }, now)).toEqual({ kind: 'ignored', event: 'sms:delivered' });
    expect(parseInbound({ hello: 1 }, now).kind).toBe('invalid');
    expect(parseInbound({ event: 'sms:received', payload: { sender: '+1' } }, now).kind).toBe('invalid');
  });
  it('uses the server clock when the phone timestamp is in the future or garbage', () => {
    const fut = { event: 'sms:received', payload: { message: 'x', receivedAt: '2027-01-01T00:00:00Z' } };
    expect((parseInbound(fut, now) as { receivedAt: Date }).receivedAt).toEqual(now);
    const bad = { event: 'sms:received', payload: { message: 'x', receivedAt: 'yesterday' } };
    expect((parseInbound(bad, now) as { receivedAt: Date }).receivedAt).toEqual(now);
  });
  it('verifies HMAC-SHA256(body + timestamp) within ±5 min', () => {
    const body = JSON.stringify(fixture);
    const ts = String(Math.floor(now.getTime() / 1000));
    const sig = signBody(body, ts, 'secret-0123456789');
    expect(verifySignature(body, ts, sig, 'secret-0123456789', now.getTime())).toEqual({ ok: true });
    expect(verifySignature(body, ts, sig.toUpperCase(), 'secret-0123456789', now.getTime())).toEqual({ ok: true });
    expect(verifySignature(body + ' ', ts, sig, 'secret-0123456789', now.getTime())).toEqual({ ok: false, why: 'mismatch' });
    expect(verifySignature(body, ts, sig, 'other-secret-xxxx', now.getTime())).toEqual({ ok: false, why: 'mismatch' });
    expect(verifySignature(body, ts, sig, 'secret-0123456789', now.getTime() + 301_000)).toEqual({ ok: false, why: 'stale' });
    expect(verifySignature(body, null, sig, 'secret-0123456789')).toEqual({ ok: false, why: 'missing' });
    expect(verifySignature(body, ts, 'zz', 'secret-0123456789', now.getTime())).toEqual({ ok: false, why: 'mismatch' });
  });
  it('sends via the documented local endpoint, or simulates', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{}', { status: 202 }); }) as unknown as typeof fetch;
    expect(await sendSms('+2135', 'hi', { mode: 'local', baseUrl: 'http://10.0.0.5:8080/', user: 'u', password: 'p', fetch: fake })).toEqual({ status: 'sent' });
    expect(seen!.url).toBe('http://10.0.0.5:8080/message');
    expect(JSON.parse(String(seen!.init.body))).toEqual({ textMessage: { text: 'hi' }, phoneNumbers: ['+2135'] });
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(await sendSms('+2135', 'hi', { mode: 'sim' })).toEqual({ status: 'simulated' });
    const fail = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    expect(await sendSms('+2135', 'hi', { mode: 'local', baseUrl: 'http://x', fetch: fail })).toEqual({ status: 'failed', error: 'gateway HTTP 401' });
  });
});

describe('rate limiting never drops a message', () => {
  it('sliding window', () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    const lim = { limit: 2, windowMs: 1000 };
    expect(rl.check('k', lim).ok).toBe(true);
    expect(rl.check('k', lim).ok).toBe(true);
    expect(rl.check('k', lim)).toEqual({ ok: false, retryAfterS: 1 });
    expect(rl.check('other', lim).ok).toBe(true);
    t = 1000;
    expect(rl.check('k', lim).ok).toBe(true);
  });
  it('a quarantined (rate-limited) SMS is stored raw, creates no incident and gets no reply', async () => {
    const s = new MemoryStore();
    const text = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E';
    const a = await ingest({
      kind: 'text', channel: 'sms', text, receivedAt: new Date('2026-10-30T13:40:00Z'),
      senderHash: 'flood', replyTo: '+2135', quarantine: 'rate_limited',
    }, s);
    expect(a).toMatchObject({ outcome: 'unparsed', error: 'rate_limited', incident_id: null });
    expect(s.state.reports[0]!.raw).toBe(text);
    expect(s.state.incidents).toHaveLength(0);
    expect(s.state.outbox).toHaveLength(0);
  });
});
