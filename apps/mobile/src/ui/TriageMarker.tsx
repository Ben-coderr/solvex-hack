import type { Band } from '@sellekni/shared';
import { TRIAGE_SIZE, triageGeometry, type TriageSize } from '@sellekni/ui-core';
import { View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { T, useTheme } from './theme';
import { useUiText } from './text';

/** Shape + letter + colour (docs/06 §2). 2 px ink outline on light; U = hollow dashed ring. Same geometry as web. */
export function TriageMarker({ band, size = 'row', selected, mode }: { band: Band; size?: TriageSize; selected?: boolean; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const px = TRIAGE_SIZE[size];
  const g = triageGeometry(band);
  const unknown = band === 'U';
  const stroke = (2 * 100) / px; // 2 device px in a 100-unit viewBox
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={txt.bandLabel(band, txt.bandName[band])}
      style={[{ width: px, height: px }, selected && { borderRadius: px, borderWidth: 3, borderColor: c.brandFill, padding: 2, width: px + 10, height: px + 10 }]}
    >
      <Svg viewBox="-4 -4 108 108" width={px} height={px}>
        <Path
          d={g.path}
          fill={unknown ? 'none' : T.color.triage[band]}
          stroke={unknown ? c.muted : c.triageOutline}
          strokeWidth={unknown ? stroke * 1.25 : stroke}
          strokeDasharray={unknown ? [stroke * 2, stroke * 1.5] : undefined}
          strokeLinejoin="round"
        />
        <SvgText
          x="50"
          y={g.letterY + 16}
          textAnchor="middle"
          fill={unknown ? c.text : T.color.onTriage[band]}
          fontSize={g.shape === 'triangle' ? 46 : 50}
          fontWeight="700"
        >
          {band}
        </SvgText>
      </Svg>
    </View>
  );
}
