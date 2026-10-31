import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import {
  Baby, Bike, Bus, Car, Droplet, Flame, Lock, MapPin, PersonStanding, RefreshCw, Send, ShieldCheck, Truck, UserX, Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Btn, Notice, Screen, Txt } from '@/src/components/kit';
import {
  EMPTY_ANSWERS, fixAgeMin, WITNESS_DANGERS, WITNESS_KINDS, WITNESS_STATES, witnessScene, type WitnessAnswers,
} from '@/src/alert/witness';
import { raiseAlert } from '@/src/services/alerts';
import { locateWitness, type WitnessFix } from '@/src/services/witness-location';
import { FONT, T, useTheme, WitnessStepper } from '@/src/ui';

const KIND_ICON: Record<(typeof WITNESS_KINDS)[number], LucideIcon> = { car: Car, moto: Bike, truck: Truck, bus: Bus, pedestrian: PersonStanding };
const STATE_ICON: Record<(typeof WITNESS_STATES)[number], LucideIcon> = { unresponsive: UserX, breathing: Wind, bleeding: Droplet };
const DANGER_ICON: Record<(typeof WITNESS_DANGERS)[number], LucideIcon> = { trapped: Lock, fire: Flame, child: Baby };

const toggle = <V,>(list: readonly V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** A big pictogram choice (56 dp, gloves and shaking hands). Radio or checkbox semantics for TalkBack. */
function Choice({ label, icon: Icon, on, onPress, radio, testID }: {
  label: ReactNode; icon?: LucideIcon; on: boolean; onPress: () => void; radio?: boolean; testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }} onPress={onPress}
      style={{ flexGrow: 1, flexBasis: '30%', minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space[2],
        paddingHorizontal: T.space[3], borderRadius: T.radius.md, borderWidth: 2,
        borderColor: on ? c.brandFill : c.line, backgroundColor: on ? c.raised : 'transparent' }}>
      {Icon && <Icon size={24} color={on ? c.brandText : c.text} />}
      <Text style={{ fontFamily: on ? FONT.uiSemibold : FONT.ui, fontSize: T.fontSize.lg, color: c.text, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: T.space[2] }} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Txt v="label" tone="muted">{title}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: T.space[2] }}>{children}</View>
    </View>
  );
}

/**
 * M6 witness mode (docs/03): vehicles → who is hurt → danger → location confirm → send. No account, GPS automatic,
 * an `SW` packet through the same outbox and channels as any alert (HTTPS, then SMS). Defaults make it 5 taps.
 */
export default function WitnessMode() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<WitnessAnswers>(EMPTY_ANSWERS);
  const [loc, setLoc] = useState<WitnessFix | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());

  const locate = () => {
    setLoc(null);
    void locateWitness().then(setLoc);
  };
  useEffect(locate, []); // start at once: the fix is usually ready by step 4
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000); // the location age keeps counting
    return () => clearInterval(id);
  }, []);

  const set = (patch: Partial<WitnessAnswers>) => setA((x) => ({ ...x, ...patch }));
  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => (step === 0 ? router.back() : setStep((s) => s - 1));

  const send = async () => {
    setSending(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = await raiseAlert({ source: 'W', scene: witnessScene(a), fix: loc?.fix ?? null });
    router.replace({ pathname: '/alert/[id]', params: { id } });
  };

  const age = fixAgeMin(loc?.fix ?? null, now);
  const count = (n: number) => (n === 3 ? t('witness.plus', { n }) : String(n));

  return (
    <Screen footer={
      <View style={{ flexDirection: 'row', gap: T.space[2] }}>
        <View style={{ flex: 1 }}><Btn kind="secondary" label={t('common.back')} onPress={back} disabled={sending} /></View>
        <View style={{ flex: 2 }}>
          {step < 3 && <Btn testID="witness-next" label={t('witness.next')} onPress={next} />}
          {step === 3 && <Btn testID="witness-confirm" icon={MapPin} label={t('witness.locConfirm')} onPress={next} disabled={loc === null} />}
          {step === 4 && <Btn testID="witness-send" big icon={Send} label={sending ? t('witness.sending') : t('witness.send')} onPress={() => void send()} disabled={sending} />}
        </View>
      </View>
    }>
      <Txt v="h1" accessibilityRole="header">{t('witness.title')}</Txt>
      {step === 0 && <Txt tone="muted">{t('witness.lead')}</Txt>}
      <WitnessStepper current={step} />

      {step === 0 && (
        <>
          <Question title={t('witness.vehiclesQ')}>
            {([1, 2, 3] as const).map((n) => (
              <Choice key={n} radio on={a.vehicles === n} label={count(n)} onPress={() => set({ vehicles: n })} testID={`witness-veh-${n}`} />
            ))}
          </Question>
          <Question title={t('witness.kindsQ')}>
            {WITNESS_KINDS.map((k) => (
              <Choice key={k} on={a.kinds.includes(k)} icon={KIND_ICON[k]} label={t(`witness.kind.${k}`)} onPress={() => set({ kinds: toggle(a.kinds, k) })} />
            ))}
          </Question>
        </>
      )}

      {step === 1 && (
        <>
          <Question title={t('witness.hurtQ')}>
            {([0, 1, 2, 3] as const).map((n) => (
              <Choice key={n} radio on={a.hurt === n} label={n === 0 ? t('witness.none') : count(n)}
                onPress={() => set({ hurt: n, ...(n === 0 && { state: [] }) })} testID={`witness-hurt-${n}`} />
            ))}
          </Question>
          {a.hurt > 0 && (
            <Question title={t('witness.stateQ')}>
              {WITNESS_STATES.map((s) => (
                <Choice key={s} on={a.state.includes(s)} icon={STATE_ICON[s]} label={t(`witness.state.${s}`)} onPress={() => set({ state: toggle(a.state, s) })} />
              ))}
            </Question>
          )}
        </>
      )}

      {step === 2 && (
        <Question title={t('witness.dangerQ')}>
          {WITNESS_DANGERS.map((d) => (
            <Choice key={d} on={a.danger.includes(d)} icon={DANGER_ICON[d]} label={t(`witness.danger.${d}`)} onPress={() => set({ danger: toggle(a.danger, d) })}
              testID={`witness-danger-${d}`} />
          ))}
          <Choice icon={ShieldCheck} on={a.danger.length === 0} label={t('witness.dangerNone')} onPress={() => set({ danger: [] })} />
        </Question>
      )}

      {step === 3 && (
        <View style={{ gap: T.space[3] }}>
          <Txt v="title">{t('witness.locTitle')}</Txt>
          {loc === null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[2] }}>
              <ActivityIndicator color={c.brandText} />
              <Txt>{t('witness.locFinding')}</Txt>
            </View>
          ) : loc.fix ? (
            <View testID="witness-location" style={{ gap: T.space[1], padding: T.space[3], borderWidth: 1, borderColor: c.line, borderRadius: T.radius.md }}>
              <Txt v="mono" ltr style={{ fontSize: T.fontSize.lg }}>{loc.fix.lat.toFixed(5)}, {loc.fix.lon.toFixed(5)}</Txt>
              {loc.kind === 'current' ? (
                <Txt tone="statusOk">{t('witness.locCurrent', { m: Math.round(loc.fix.accM ?? 0) })}</Txt>
              ) : (
                // last known fix: sent as is, and its age is said out loud (docs/03 edge case)
                <Txt tone="statusWarn">{age ? t('witness.locLast', { n: age }) : t('witness.locLastNow')}</Txt>
              )}
            </View>
          ) : (
            <Notice text={t('witness.locNone')} tone="statusWarn" icon={MapPin} />
          )}
          {loc?.denied && <Notice text={t('witness.locDenied')} tone="statusInfo" />}
          {loc !== null && loc.kind !== 'current' && <Btn kind="quiet" icon={RefreshCw} label={t('witness.locRetry')} onPress={locate} />}
        </View>
      )}

      {step === 4 && (
        <View style={{ gap: T.space[3] }}>
          <Txt v="title">{t('witness.summary', { v: count(a.vehicles), p: a.hurt === 0 ? t('witness.none') : count(a.hurt) })}</Txt>
          {[...a.state.map((s) => t(`witness.state.${s}`)), ...a.danger.map((d) => t(`witness.danger.${d}`))].map((line) => (
            <Txt key={line}>• {line}</Txt>
          ))}
          <Txt v="small" tone="muted">{t('witness.call')}</Txt>
        </View>
      )}
    </Screen>
  );
}
