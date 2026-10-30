import Constants from 'expo-constants';
import { router } from 'expo-router';
import { PlayCircle, Volume2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { probeHealth } from '@/src/alert/https';
import { Btn, Field, Screen, Section, Segmented, Txt } from '@/src/components/kit';
import { applyLocale } from '@/src/i18n';
import { testAlarm } from '@/src/services/alarm';
import { PHONE_RE, URL_RE, useSettings } from '@/src/state/settings';
import { LocaleSwitch, T, useTheme } from '@/src/ui';

/** Settings (M8). Inputs save on "Save" after validation; toggles apply at once. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const s = useSettings();
  const [serverUrl, setServerUrl] = useState(s.serverUrl);
  const [ingestKey, setIngestKey] = useState(s.ingestKey);
  const [gw1, setGw1] = useState(s.gw1);
  const [gw2, setGw2] = useState(s.gw2);
  const [probe, setProbe] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle');
  const [saved, setSaved] = useState(false);

  const urlErr = serverUrl && !URL_RE.test(serverUrl.trim()) ? t('settings.invalidUrl') : null;
  const gw1Err = gw1 && !PHONE_RE.test(gw1.trim()) ? t('settings.invalidPhone') : null;
  const gw2Err = gw2 && !PHONE_RE.test(gw2.trim()) ? t('settings.invalidPhone') : null;
  const invalid = !!(urlErr || gw1Err || gw2Err);

  const save = () => {
    s.set({ serverUrl: serverUrl.trim(), ingestKey: ingestKey.trim(), gw1: gw1.trim(), gw2: gw2.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2_000);
  };
  const test = async () => {
    setProbe('busy');
    setProbe((await probeHealth(fetch, serverUrl.trim())) ? 'ok' : 'fail');
  };

  return (
    <Screen footer={
      <View style={{ flexDirection: 'row', gap: T.space[3] }}>
        <View style={{ flex: 1 }}><Btn kind="secondary" label={t('common.back')} onPress={() => router.back()} /></View>
        <View style={{ flex: 1 }}><Btn testID="settings-save" label={saved ? t('common.saved') : t('common.save')} disabled={invalid} onPress={save} /></View>
      </View>
    }>
      <Txt v="h1" accessibilityRole="header">{t('settings.title')}</Txt>

      <Section title={t('settings.language')}>
        <LocaleSwitch value={(i18n.language as 'ar' | 'fr' | 'en')} onChange={(l) => { s.set({ locale: l }); void applyLocale(l); }} />
        <Txt v="small" tone="muted">{t('onboarding.rtlRestart')}</Txt>
      </Section>

      <Section title={t('settings.server')}>
        <Field testID="server-url" label={t('settings.serverUrl')} value={serverUrl} onChangeText={setServerUrl} hint={t('settings.serverHint')} error={urlErr} ltr keyboardType="url" />
        <Field testID="ingest-key" label={t('settings.key')} value={ingestKey} onChangeText={setIngestKey} hint={t('settings.keyHint')} ltr secure />
        <Btn kind="secondary" label={t('settings.test')} disabled={!serverUrl || !!urlErr || probe === 'busy'} onPress={() => void test()} />
        {probe === 'ok' && <Txt v="small" tone="statusOk">{t('settings.reachable')}</Txt>}
        {probe === 'fail' && <Txt v="small" tone="statusDanger">{t('settings.unreachable')}</Txt>}
      </Section>

      <Section title={t('settings.gateways')}>
        <Field label={t('settings.gw1')} value={gw1} onChangeText={setGw1} hint={t('settings.gwHint')} error={gw1Err} ltr keyboardType="phone-pad" />
        <Field label={t('settings.gw2')} value={gw2} onChangeText={setGw2} hint={t('settings.gwHint')} error={gw2Err} ltr keyboardType="phone-pad" />
        <Txt v="label">{t('settings.sim')}</Txt>
        <Txt v="small" tone="muted">{t('settings.simLater')}</Txt>
      </Section>

      <Section title={t('settings.demo')} right={
        <Switch testID="demo-switch" accessibilityLabel={t('settings.demo')} value={s.demoMode} onValueChange={(v) => s.set({ demoMode: v })}
          trackColor={{ true: c.brandFill, false: c.line }} thumbColor={c.surface} />
      }>
        <Txt v="small" tone="muted">{t('settings.demoHint')}</Txt>
        {s.demoMode && (
          <>
            <Txt v="label">{t('settings.countdown')}</Txt>
            <Segmented label={t('settings.countdown')} value={s.demoCountdownS} onChange={(n) => s.set({ demoCountdownS: n })}
              options={[10, 20, 30].map((n) => ({ value: n, label: t('settings.seconds', { n }) }))} />
            <Btn kind="secondary" icon={PlayCircle} label={t('settings.replay')} onPress={() => router.push('/replay')} />
          </>
        )}
      </Section>

      <Section>
        <Btn kind="secondary" icon={Volume2} label={t('settings.alarmTest')} onPress={() => void testAlarm()} />
        <Txt v="small" tone="muted">{t('onboarding.silentBody')}</Txt>
      </Section>

      <Section title={t('settings.sensorLab')}>
        <Txt v="small" tone="muted">{t('settings.sensorLabLater')}</Txt>
      </Section>

      <Txt v="small" tone="muted" ltr>{t('settings.version', { v: Constants.expoConfig?.version ?? '0' })}</Txt>
    </Screen>
  );
}
