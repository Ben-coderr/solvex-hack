package expo.modules.najdanative

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SmsMessage
import android.telephony.SubscriptionManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SendOptions : Record {
  @Field val id: String = ""
  /** -1 = the phone's default SMS SIM */
  @Field val subscriptionId: Int = -1
}

class SmsPermissionException : CodedException("E_SMS_PERMISSION", "SEND_SMS is not granted", null)
class SmsUnavailableException(why: String) : CodedException("E_SMS_UNAVAILABLE", why, null)

/**
 * Sensor Lab T1 (docs/13 §6.3) and the silent-SMS channel (docs/04 §3.4).
 *
 * SMS: `SmsManager.sendTextMessage` with a sent and a delivered PendingIntent per message; the receivers below turn
 * them into `onSmsResult` events {id, status: sent|delivered|failed, code}. The JS side owns retries and ordering;
 * this module only sends and reports. A result that arrives while JS is not listening is lost: the outbox treats a
 * message with no result after its timeout as unknown and sends it again (ingest is idempotent on the incident id).
 */
class NajdaNativeModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext?.applicationContext

  private val actionSent get() = "${ctx?.packageName}.najda.SMS_SENT"
  private val actionDelivered get() = "${ctx?.packageName}.najda.SMS_DELIVERED"

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val id = intent.getStringExtra(EXTRA_ID) ?: return
      when (intent.action) {
        actionSent -> {
          val ok = resultCode == Activity.RESULT_OK
          // RESULT_ERROR_GENERIC_FAILURE 1, NO_SERVICE 4, NULL_PDU 3, RADIO_OFF 2, … (SmsManager constants)
          emit(id, if (ok) "sent" else "failed", if (ok) null else resultCode)
        }
        actionDelivered -> {
          // the status report's TP-Status: 0x00-0x1F done, 0x20-0x3F still trying (ignored), >= 0x40 failed
          val pdu = intent.getByteArrayExtra("pdu")
          val format = intent.getStringExtra("format")
          val status = pdu?.let { runCatching { SmsMessage.createFromPdu(it, format).status }.getOrNull() }
          when {
            status == null || status < 0x20 -> emit(id, "delivered", null)
            status >= 0x40 -> emit(id, "failed", status)
          }
        }
      }
    }
  }

  private fun emit(id: String, status: String, code: Int?) {
    sendEvent("onSmsResult", mapOf("id" to id, "status" to status, "code" to code))
  }

  override fun definition() = ModuleDefinition {
    Name("NajdaNative")

    Events("onSmsResult")

    OnCreate {
      val c = ctx ?: return@OnCreate
      val filter = IntentFilter().apply { addAction(actionSent); addAction(actionDelivered) }
      // PendingIntents run as this app, so a non-exported receiver still hears them
      if (Build.VERSION.SDK_INT >= 33) c.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else c.registerReceiver(receiver, filter)
    }

    OnDestroy {
      runCatching { ctx?.unregisterReceiver(receiver) }
    }

    Function("getMotionSensors") {
      val sm = ctx?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
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

    /**
     * Active SIMs. The full list needs READ_PHONE_STATE (asked only when the person opens the SIM choice); without it
     * this returns just the default SMS subscription (carrier unknown) or nothing when the phone "asks every time".
     */
    Function("getSimInfo") {
      val c = ctx ?: return@Function emptyList<Map<String, Any?>>()
      val sm = c.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
      val defaultSms = SubscriptionManager.getDefaultSmsSubscriptionId()
      val canRead = c.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
      val list = if (canRead && sm != null) runCatching { sm.activeSubscriptionInfoList }.getOrNull().orEmpty() else emptyList()
      if (list.isNotEmpty()) {
        list.map {
          mapOf(
            "subscriptionId" to it.subscriptionId,
            "carrier" to (it.carrierName?.toString() ?: it.displayName?.toString() ?: ""),
            "slot" to it.simSlotIndex,
            "isDefaultSms" to (it.subscriptionId == defaultSms),
          )
        }
      } else if (defaultSms != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
        listOf(mapOf("subscriptionId" to defaultSms, "carrier" to "", "slot" to -1, "isDefaultSms" to true))
      } else {
        emptyList()
      }
    }

    AsyncFunction("sendSms") { to: String, text: String, opts: SendOptions ->
      val c = ctx ?: throw SmsUnavailableException("no context")
      if (c.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) throw SmsPermissionException()
      if (opts.id.isEmpty()) throw SmsUnavailableException("missing id")
      val manager: SmsManager = when {
        Build.VERSION.SDK_INT >= 31 -> {
          val base = c.getSystemService(SmsManager::class.java) ?: throw SmsUnavailableException("no SmsManager")
          if (opts.subscriptionId >= 0) base.createForSubscriptionId(opts.subscriptionId) else base
        }
        opts.subscriptionId >= 0 -> @Suppress("DEPRECATION") SmsManager.getSmsManagerForSubscriptionId(opts.subscriptionId)
        else -> @Suppress("DEPRECATION") SmsManager.getDefault()
      }
      // one request code per message id so two messages in flight never share (and overwrite) a PendingIntent
      val code = opts.id.hashCode()
      fun pi(action: String, mutable: Boolean): PendingIntent {
        val i = Intent(action).setPackage(c.packageName).putExtra(EXTRA_ID, opts.id)
        // the delivery report's PDU is a fill-in extra: that intent must be mutable (explicit, so allowed on 14+)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
          if (mutable && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(c, code, i, flags)
      }
      val sent = pi(actionSent, false)
      val delivered = pi(actionDelivered, true)
      val parts = manager.divideMessage(text)
      if (parts.size <= 1) {
        manager.sendTextMessage(to, null, text, sent, delivered)
      } else {
        // packets are ≤ 160 GSM-7 and never get here; only a human-readable Arabic text to a contact can (UCS-2, 70/part).
        // Results are reported for the LAST part only.
        val sentList = ArrayList<PendingIntent?>(List(parts.size) { null }).apply { this[parts.size - 1] = sent }
        val delivList = ArrayList<PendingIntent?>(List(parts.size) { null }).apply { this[parts.size - 1] = delivered }
        manager.sendMultipartTextMessage(to, null, parts, sentList, delivList)
      }
    }
  }

  companion object {
    private const val EXTRA_ID = "najda.sms.id"
  }
}
