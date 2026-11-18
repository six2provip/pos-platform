package com.posplatform.pos_mobile

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
                when (call.method) {
                    "getHardwareSerial" -> result.success(readHardwareSerial())
                    "hasNetworkConnection" -> result.success(hasNetworkConnection())
                    "openWifiSettings" -> {
                        openWifiSettings()
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun hasNetworkConnection(): Boolean {
        return try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val net = cm.activeNetwork ?: return false
                val caps = cm.getNetworkCapabilities(net) ?: return false
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
            } else {
                @Suppress("DEPRECATION")
                cm.activeNetworkInfo?.isConnected == true
            }
        } catch (_: Throwable) {
            true
        }
    }

    private fun openWifiSettings() {
        try {
            val intent = Intent(Settings.ACTION_WIFI_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (_: Throwable) {
            try {
                val fallback = Intent(Settings.ACTION_WIRELESS_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(fallback)
            } catch (_: Throwable) {
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
