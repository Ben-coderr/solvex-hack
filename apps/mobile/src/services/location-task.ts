import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

/**
 * The Drive-mode location task. Defined at module scope (TaskManager requirement), imported once by the root
 * layout. Locations arrive here from the Android foreground service and are fanned out to the drive controller.
 */
export const LOCATION_TASK = 'najda-drive-location';

type Listener = (loc: LocationObject) => void;
const listeners = new Set<Listener>();
export function onTaskLocation(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    for (const loc of data.locations) listeners.forEach((l) => l(loc));
  });
}
