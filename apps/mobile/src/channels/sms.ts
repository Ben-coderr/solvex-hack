/**
 * Silent SMS channel (docs/04 §3.4) over modules/najda-native (Kotlin, SmsManager). The result of a send arrives
 * later as an event: sent (left the phone) → delivered (status report from the network) or failed (with the
 * SmsManager / TP-Status code). Android only; `SEND_SMS` is Play-restricted, so this build is sideloaded.
 * The contract and the fake live in `sms-core.ts`.
 */
import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';
import type { SimInfo, SmsChannel, SmsPermission, SmsResult } from './sms-core';

export * from './sms-core';

interface NativeSms {
  getSimInfo(): SimInfo[];
  sendSms(to: string, text: string, opts: { id: string; subscriptionId: number }): Promise<void>;
  addListener(event: 'onSmsResult', cb: (r: SmsResult) => void): { remove(): void };
}

const Native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeSms>('NajdaNative') : null;
// a dev build made before P5 has the module without the SMS functions
const native = Native && typeof Native.sendSms === 'function' ? Native : null;

// read lazily: PermissionsAndroid is undefined outside Android (web preview, static export)
const SEND = () => PermissionsAndroid.PERMISSIONS.SEND_SMS;
const PHONE = () => PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
const asPerm = (r: string): SmsPermission =>
  r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';

export const nativeSms: SmsChannel = {
  available: native !== null,
  async permission() {
    if (!native) return 'unsupported';
    return (await PermissionsAndroid.check(SEND())) ? 'granted' : 'denied';
  },
  async requestPermission() {
    if (!native) return 'unsupported';
    return asPerm(await PermissionsAndroid.request(SEND()));
  },
  sims() {
    if (!native) return [];
    try {
      return native.getSimInfo();
    } catch {
      return [];
    }
  },
  async requestSimAccess() {
    if (!native) return false;
    return (await PermissionsAndroid.request(PHONE())) === PermissionsAndroid.RESULTS.GRANTED;
  },
  async send(to, text, opts) {
    if (!native) throw Object.assign(new Error('native SMS not in this build'), { code: 'E_SMS_UNAVAILABLE' });
    await native.sendSms(to, text, { id: opts.id, subscriptionId: opts.subscriptionId ?? -1 });
  },
  onResult(cb) {
    return native ? native.addListener('onSmsResult', cb) : { remove() {} };
  },
};
