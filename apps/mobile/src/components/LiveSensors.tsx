import { Activity, Check, Clock, Gauge, MapPin, Minus, RotateCw, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { resetPeak } from '../services/drive';
import type { SensorLive, Telemetry } from '../state/session';
import { FONT, T, useTheme } from '../ui';
import { Btn, Section, Txt } from './kit';

type Tone = 'statusOk' | 'statusWarn' | 'muted';
const ST: Record<SensorLive, [LucideIcon, Tone]> = { live: [Check, 'statusOk'], waiting: [Clock, 'statusWarn'], missing: [Minus, 'muted'], off: [Minus, 'muted'] };

function Tile({ icon: Icon, name, live, value, sub }: { icon: LucideIcon; name: string; live: SensorLive; value: string; sub?: string | null }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [SI, tone] = ST[live];
  return (
    <View accessible accessibilityLabel={`${name}: ${t(`drive.live.st_${live}`)}. ${value}${sub ? `. ${sub}` : ''}`}
      style={{ flexGrow: 1, flexBasis: '46%', gap: T.space[1], padding: T.space[3], borderRadius: T.radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[1] }}>
        <Icon size={16} color={c.muted} />
        <Txt v="small" tone="muted" style={{ flex: 1 }} numberOfLines={1}>{name}</Txt>
        <SI size={14} color={c[tone]} />
        <Txt v="small" tone={tone}>{t(`drive.live.st_${live}`)}</Txt>
      </View>
      <Txt v="title" ltr style={{ fontFamily: FONT.display }}>{value}</Txt>
      {sub ? <Txt v="small" tone="muted">{sub}</Txt> : null}
    </View>
  );
}

const n = (v: number | null, digits: number) => (v === null ? '—' : v.toFixed(digits));

/**
 * Live sensor panel (Drive mode, live only): every sensor with ✓ / waiting / missing and its current value, so the
 * person (and the jury) can SEE the sensors work. Shaking raises the peak; it never alerts (the detector needs
 * driving, a speed drop and a stop). A phone accelerometer stops at its range: at the limit the peak reads "≥".
 */
export function LiveSensors({ tel, rangeG, rateHz, speedKmh, accM }: { tel: Telemetry; rangeG: number; rateHz: number | null; speedKmh: number | null; accM: number | null }) {
  const { t } = useTranslation();
  const atLimit = tel.peakG !== null && rangeG > 0 && tel.peakG >= rangeG * 0.98;
  const peak = tel.peakG === null ? '—' : atLimit ? `≥ ${rangeG} g` : `${tel.peakG.toFixed(1)} g`;
  return (
    <Section title={t('drive.live.title')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: T.space[2] }}>
        <Tile icon={Activity} name={t('drive.live.acc')} live={tel.sensors.accelerometer} value={`${n(tel.accG, 2)} g`}
          sub={`${t('drive.live.peak')} ${peak}${rangeG > 0 ? ` · ±${rangeG} g` : ''}${rateHz ? ` · ${rateHz} Hz` : ''}`} />
        <Tile icon={RotateCw} name={t('drive.live.gyro')} live={tel.sensors.gyroscope} value={`${n(tel.gyroDps, 0)} °/s`} />
        <Tile icon={MapPin} name={t('drive.live.gps')} live={tel.sensors.gps} value={`${speedKmh === null ? '—' : Math.round(speedKmh)} km/h`}
          sub={[tel.speedSource ? t(`drive.live.src_${tel.speedSource}`) : null, accM !== null ? `± ${Math.round(accM)} m` : null].filter(Boolean).join(' · ') || null} />
        <Tile icon={Gauge} name={t('drive.live.baro')} live={tel.sensors.barometer} value={`${n(tel.hpa, 1)} hPa`} sub={t('drive.live.baroNote')} />
      </View>
      <Txt v="small" tone="muted">{t('drive.live.hint')}</Txt>
      <Btn kind="quiet" label={t('drive.live.reset')} onPress={resetPeak} />
    </Section>
  );
}
