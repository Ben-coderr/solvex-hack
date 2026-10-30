import { describe, expect, it } from 'vitest';
import { parseStatusSms, samePhone } from './status-sms';

describe('D14 status SMS', () => {
  it('parses the documented form and its variants', () => {
    expect(parseStatusSms('SLK STATUS CHU-A SAT', 'SLK')).toEqual({ hospitalId: 'CHU-A', status: 'SATURATED' });
    expect(parseStatusSms('  slk  status  eph-b   ok ', 'SLK')).toEqual({ hospitalId: 'EPH-B', status: 'OK' });
    expect(parseStatusSms('SLK STATUS CHU-A BUSY', 'SLK')).toEqual({ hospitalId: 'CHU-A', status: 'BUSY' });
  });
  it('rejects anything else (it then goes to the normal ingest path, stored raw)', () => {
    expect(parseStatusSms('SLK STATUS CHU-A FULLISH', 'SLK')).toBeNull();
    expect(parseStatusSms('SLK1 K7Q2M R75H …', 'SLK')).toBeNull();
    expect(parseStatusSms('STATUS CHU-A SAT', 'SLK')).toBeNull();
  });
  it('compares numbers on their last 9 digits', () => {
    expect(samePhone('+213555000101', '0555000101')).toBe(true);
    expect(samePhone('+213555000101', '+213555000102')).toBe(false);
    expect(samePhone('123', '123')).toBe(false);
  });
});
