import { requireOptionalNativeModule } from 'expo';
import { accelerometerRangeG, type MotionSensor } from '../sensorlab/stats';

/** modules/sellekni-native (Kotlin). Optional: absent on web and in a build made before the module existed. */
const SellekniNative = requireOptionalNativeModule<{ getMotionSensors(): MotionSensor[] }>('SellekniNative');

export const nativeSensorInfoAvailable = SellekniNative !== null;

/** T1 inventory; null = the native module is not in this build (enter the range by hand in the Sensor Lab). */
export function readMotionSensors(): MotionSensor[] | null {
  if (!SellekniNative) return null;
  try {
    return SellekniNative.getMotionSensors();
  } catch {
    return null;
  }
}

/** The default accelerometer's real range in g, read from Android; null if unknown. */
export function readAccelerometerRangeG(): number | null {
  const list = readMotionSensors();
  return list ? accelerometerRangeG(list) : null;
}
