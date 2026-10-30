package expo.modules.najdanative

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sensor Lab T1 (docs/13 §6.3): the motion sensors as Android reports them. Read-only, no permission needed.
 * The detector's rangeG comes from the default accelerometer's maximumRange (m/s², converted to g in JS).
 * P5 adds the silent-SMS functions to this same module.
 */
class NajdaNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NajdaNative")

    Function("getMotionSensors") {
      val sm = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        ?: return@Function emptyList<Map<String, Any?>>()
      val defaults = listOf(Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_GYROSCOPE)
        .mapNotNull { sm.getDefaultSensor(it) }
      listOf(Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_ACCELEROMETER_UNCALIBRATED, Sensor.TYPE_GYROSCOPE)
        .flatMap { sm.getSensorList(it) }
        .map { s ->
          mapOf(
            "kind" to when (s.type) {
              Sensor.TYPE_ACCELEROMETER -> "accelerometer"
              Sensor.TYPE_ACCELEROMETER_UNCALIBRATED -> "accelerometer_uncalibrated"
              else -> "gyroscope"
            },
            "name" to s.name,
            "vendor" to s.vendor,
            "version" to s.version,
            "maximumRange" to s.maximumRange.toDouble(),
            "resolution" to s.resolution.toDouble(),
            "minDelayUs" to s.minDelay,
            "maxDelayUs" to s.maxDelay,
            "fifoMaxEventCount" to s.fifoMaxEventCount,
            "isWakeUp" to s.isWakeUpSensor,
            "isDefault" to defaults.contains(s),
          )
        }
    }
  }
}
