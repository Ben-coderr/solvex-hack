import { Linking, Pressable, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nativeSms, type SimInfo } from '../channels/sms';
import { refreshSmsPermission, requestSmsPermission } from '../services/alerts';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { FONT, T, useTheme } from '../ui';
import { Btn, Notice, Txt } from './kit';

/**
 * SEND_SMS + dual-SIM choice (docs/04 §12: without a chosen subscription, SMS goes out on the default SMS SIM, or
 * nowhere when the phone "asks every time"). Asked once, remembered in Settings, shown as slot + carrier.
 * Refusing never blocks: the composer fallback stays, and the text says so.
 */
export function SmsSetup() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const perm = useSession((s) => s.perms.sms);
  const simId = useSettings((s) => s.simSubscriptionId);
  const simLabel = useSettings((s) => s.simLabel);
  const set = useSettings((s) => s.set);
  const [sims, setSims] = useState<SimInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);

  const reload = useCallback(() => setSims(nativeSms.sims()), []);
  useEffect(() => { void refreshSmsPermission().then(reload); }, [reload]);

  if (!nativeSms.available) return <Notice text={t('onboarding.smsNoNative')} tone="statusInfo" />;

  const allow = async () => {
    setBusy(true);
    await requestSmsPermission();
    reload();
    setBusy(false);
  };
  const showSims = async () => {
    setBusy(true);
    await nativeSms.requestSimAccess();
    setAsked(true);
    reload();
    setBusy(false);
  };
  // without READ_PHONE_STATE the module returns at most the default SIM, with no slot
  const needAccess = !asked && (sims.length === 0 || sims.every((s) => s.slot < 0));
  const label = (s: { slot: number; carrier: string }) => t('settings.simSlot', { slot: s.slot + 1, carrier: s.carrier || t('settings.simUnknownCarrier') });
  const chosen = simId ?? sims.find((s) => s.isDefaultSms)?.subscriptionId ?? null;

  return (
    <View style={{ gap: T.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[2] }}>
        <Txt v="label" style={{ flex: 1 }}>{t('settings.smsPerm')}</Txt>
        {perm !== 'undetermined' && (
          <Txt v="small" tone={perm === 'granted' ? 'statusOk' : 'statusWarn'}>{perm === 'granted' ? t('settings.smsPermGranted') : t('onboarding.denied')}</Txt>
        )}
      </View>
      {perm !== 'granted' && (
        <>
          <Txt v="small">{t('settings.smsPermDenied')}</Txt>
          {perm === 'undetermined'
            ? <Btn testID="sms-allow" label={t('settings.smsPermAllow')} disabled={busy} onPress={() => void allow()} />
            : <Btn kind="secondary" label={t('onboarding.openSettings')} onPress={() => void Linking.openSettings()} />}
        </>
      )}

      {perm === 'granted' && (
        <View style={{ gap: T.space[2] }}>
          <Txt v="label">{t('settings.sim')}</Txt>
          {simLabel && <Txt v="small" tone="muted">{t('settings.simChosen', { slot: simLabel.slot + 1, carrier: simLabel.carrier || t('settings.simUnknownCarrier') })}</Txt>}
          {needAccess && (
            <>
              <Btn kind="secondary" label={t('settings.simAccess')} disabled={busy} onPress={() => void showSims()} />
              <Txt v="small" tone="muted">{t('settings.simAccessNote')}</Txt>
            </>
          )}
          {!needAccess && sims.length === 1 && <Txt v="small" tone="muted">{label(sims[0]!)}</Txt>}
          {sims.length > 1 && (
            <>
              <Txt v="small">{t('settings.simAsk', { n: sims.length })}</Txt>
              <View accessibilityRole="radiogroup" style={{ gap: T.space[2] }}>
                {sims.map((s) => {
                  const on = s.subscriptionId === chosen;
                  return (
                    <Pressable key={s.subscriptionId} testID={`sim-${s.slot}`} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      onPress={() => set({ simSubscriptionId: s.subscriptionId, simLabel: { slot: s.slot, carrier: s.carrier } })}
                      style={{ minHeight: T.size.touchMin, justifyContent: 'center', padding: T.space[3], borderRadius: T.radius.md, borderWidth: on ? 2 : 1, borderColor: on ? c.brandFill : c.line, backgroundColor: c.surface }}>
                      <Txt v="label" style={{ fontFamily: on ? FONT.uiSemibold : FONT.ui }}>{label(s)}</Txt>
                      {s.isDefaultSms && <Txt v="small" tone="muted">{t('settings.simDefault')}</Txt>}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {asked && sims.length === 0 && <Txt v="small" tone="statusWarn">{t('settings.simNone')}</Txt>}
        </View>
      )}
    </View>
  );
}
