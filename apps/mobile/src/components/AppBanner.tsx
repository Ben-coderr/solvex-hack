import { View } from 'react-native';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { StatusBanner } from '../ui';

/** Top of every screen: REPLAY and DEMO can never be missed; the link state is the probed one. */
export function AppBanner() {
  const replay = useSession((s) => s.replay !== null);
  const link = useSession((s) => s.link);
  const demo = useSettings((s) => s.demoMode);
  return (
    <View testID="app-banner">
      {replay && <StatusBanner mode="replay" />}
      {demo && <StatusBanner mode="demo" />}
      {link !== 'unknown' && <StatusBanner mode={link} />}
    </View>
  );
}
