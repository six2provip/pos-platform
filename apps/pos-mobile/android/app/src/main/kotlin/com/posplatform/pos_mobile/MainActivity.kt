package com.posplatform.pos_mobile

import android.annotation.SuppressLint
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "com.posplatform.pos_mobile/hardware"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                if (call.method == "getHardwareSerial") {
                    result.success(readHardwareSerial())
                } else {
                    result.notImplemented()
                }
            }
    }

    @SuppressLint("HardwareIds")
    private fun readHardwareSerial(): String {
        val rawSerial = try {
            @Suppress("DEPRECATION")
            val s = Build.SERIAL
            if (!s.isNullOrBlank() && !s.equals("unknown", ignoreCase = true)) {
                s.trim().uppercase()
            } else {
                null
            }
        } catch (_: Throwable) {
            null
        }

        if (rawSerial != null && rawSerial.length >= 4) {
            return rawSerial
        }

        val androidId = try {
            Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                ?.trim()
                ?.uppercase()
        } catch (_: Throwable) {
            null
        }

        return if (!androidId.isNullOrBlank()) {
            "POS-$androidId"
        } else {
            "POS-${Build.MODEL.replace(" ", "").uppercase()}"
        }
    }
}
