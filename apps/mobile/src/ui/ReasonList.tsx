import type { Confidence } from '@najda/shared';
import { Info } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ConfidencePill } from './Badges';
import { FONT, T, useTheme } from './theme';
import { useUiText } from './text';

export interface ReasonItem { code: string; points: number }

/** Top-3 reasons + confidence + the fixed disclaimer (always). */
export function ReasonList({ reasons, conf, values = {}, mode }: { reasons: readonly ReasonItem[]; conf: Confidence; values?: Partial<Record<string, number>>; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  return (
    <View style={{ gap: T.space[3] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: FONT.uiMedium, fontSize: T.fontSize.sm, color: c.muted }}>{txt.reasonsTitle}</Text>
        <ConfidencePill conf={conf} mode={mode} />
      </View>
      {reasons.length === 0
        ? <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.base, color: c.muted }}>{txt.reasonsNone}</Text>
        : reasons.slice(0, 3).map((r) => (
          <View key={r.code} style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline' }}>
            <Text style={{ width: 40, textAlign: 'right', fontFamily: FONT.mono, fontSize: T.fontSize.sm, color: c.muted, writingDirection: 'ltr' }}>+{r.points}</Text>
            <Text style={{ flexShrink: 1, fontFamily: FONT.ui, fontSize: T.fontSize.base, color: c.text }}>{txt.reason(r.code, values[r.code])}</Text>
          </View>
        ))}
      <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}>
        <Info size={16} color={c.muted} />
        <Text style={{ flexShrink: 1, fontFamily: FONT.ui, fontSize: T.fontSize.sm, color: c.muted }}>{txt.disclaimer}</Text>
      </View>
    </View>
  );
}
