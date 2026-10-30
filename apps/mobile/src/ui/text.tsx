import { createContext, useContext, type ReactNode } from 'react';

/**
 * Strings used inside the design-system components. English defaults here; P4 plugs i18next (ar/fr/en) in
 * through <UiTextProvider value={…}> so components never hard-code copy. Keys mirror apps/web/messages.
 */
export const EN = {
  bandName: { R: 'Critical', O: 'Serious', Y: 'Moderate', G: 'Minor', U: 'Unknown' },
  bandLabel: (band: string, name: string) => `Band ${band}: ${name} (estimated)`,
  confidence: { H: 'High confidence', M: 'Medium confidence', L: 'Low confidence' },
  disclaimer: 'Estimated risk, not a diagnosis. Confirm by call-back.',
  reasonsTitle: 'Why this estimate',
  reasonsNone: 'No risk factor reported yet.',
  reason: (code: string, value?: number) => ({
    dv: `Speed drop ${value ?? ''} km/h`, peak_g: 'Strong impact', rollover: 'Rollover', no_response: 'No response to the countdown',
    unresponsive: 'Not responding', breathing: 'Breathing difficulty', bleeding: 'Heavy bleeding', trapped: 'Trapped',
    child: 'Child involved', vulnerable_user: 'Pedestrian or motorcyclist', spo2_low: 'Low oxygen', hr_abnormal: 'Abnormal heart rate',
  } as Record<string, string>)[code] ?? code,
  packetGsm7: 'GSM-7', packetNotGsm7: 'Not GSM-7', packetTooLong: 'Too long',
  packetInvalid: (code: string) => `Could not be read: ${code}`, packetCrc: 'Checksum does not match: shown as received',
  goldenLabel: (m: number) => `${m} min since impact`, min: 'min',
  countdownLabel: (s: number) => `${s} seconds before the alert is sent`, sec: 's', sending: 'Sending',
  sos: { idle: 'Hold for SOS', hint: 'Hold 1.5 s', pressed: 'Keep holding…', sending: 'Sending…', sent: 'Alert sent' },
  channel: { https: 'Internet', sms: 'SMS', paste: 'Pasted SMS', witness: 'Witness page', sim: 'Simulated' },
  channelStatus: { sent: 'sent', retrying: 'retrying', acked: 'received', failed: 'failed' },
  status: {
    online: 'Online', sms_only: 'SMS only — alerts still go out', offline: 'Offline — saved, will retry',
    replay: 'REPLAY · SYNTHETIC', replay_box: 'REPLAY · SYNTHETIC · BOX (simulated)', demo: 'DEMO — synthetic data',
  },
  witnessSteps: ['Vehicles', 'Who is hurt', 'Danger', 'Location', 'Send'],
  witnessProgress: (c: number, t: number) => `Step ${c} of ${t}`,
  locale: { label: 'Language', ar: 'العربية', fr: 'Français', en: 'English' },
  emptyTitle: 'Nothing here yet', emptyBody: 'New items appear here within seconds.',
  errorTitle: 'Could not load', errorBody: 'Your data is safe. Check the connection and try again.', retry: 'Try again', loading: 'Loading',
};
export type UiText = typeof EN;

const Ctx = createContext<UiText>(EN);
export const UiTextProvider = ({ value, children }: { value: UiText; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export const useUiText = () => useContext(Ctx);
