/* Todos los derechos de desarrollo reservados a AR Group 2026 */
package com.argroup.smartalk.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.example.MainActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

interface WalkieTalkieServiceContract {
    val activeChannelId: StateFlow<String?>
    val isTransmitting: StateFlow<Boolean>
    val isServiceRunning: StateFlow<Boolean>
    fun joinChannel(channelId: String)
    fun leaveChannel()
    fun startTransmission()
    fun stopTransmission()
}

class WalkieTalkieService : Service(), WalkieTalkieServiceContract {

    companion object {
        private const val TAG = "WalkieTalkieService"
        const val CHANNEL_ID = "smartalk_ptt_foreground_channel"
        const val NOTIFICATION_ID = 2026
        const val ACTION_START_PTT = "com.argroup.smartalk.action.START_PTT"
        const val ACTION_STOP_PTT = "com.argroup.smartalk.action.STOP_PTT"
        const val EXTRA_CHANNEL_ID = "com.argroup.smartalk.extra.CHANNEL_ID"
    }

    inner class LocalBinder : Binder() {
        fun getService(): WalkieTalkieService = this@WalkieTalkieService
    }

    private val binder = LocalBinder()

    private val _activeChannelId = MutableStateFlow<String?>(null)
    override val activeChannelId: StateFlow<String?> = _activeChannelId.asStateFlow()

    private val _isTransmitting = MutableStateFlow(false)
    override val isTransmitting: StateFlow<Boolean> = _isTransmitting.asStateFlow()

    private val _isServiceRunning = MutableStateFlow(false)
    override val isServiceRunning: StateFlow<Boolean> = _isServiceRunning.asStateFlow()

    private var isNoisyReceiverRegistered = false

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                Log.w(TAG, "Audio becoming noisy detectado (desconexión de auriculares/Bluetooth). Deteniendo TX.")
                stopTransmission()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        registerNoisyReceiverSafely()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_PTT -> {
                stopPttForegroundSafely()
                return START_NOT_STICKY
            }
            ACTION_START_PTT, null -> {
                val channelId = intent?.getStringExtra(EXTRA_CHANNEL_ID) ?: _activeChannelId.value ?: "GENERAL"
                val promoted = promoteToForegroundSafely(channelId)
                if (!promoted) {
                    Log.e(TAG, "No fue posible promover WalkieTalkieService a Foreground (permisos o estado de Android 14+). Deteniendo servicio de forma segura.")
                    stopSelf()
                    return START_NOT_STICKY
                }
                joinChannel(channelId)
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    private fun registerNoisyReceiverSafely() {
        if (isNoisyReceiverRegistered) return
        try {
            val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ (API 33 / TargetSDK 36): obligatorio especificar flag de exportación
                registerReceiver(noisyReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                registerReceiver(noisyReceiver, filter)
            }
            isNoisyReceiverRegistered = true
        } catch (e: Throwable) {
            Log.e(TAG, "Error registrando noisyReceiver en WalkieTalkieService", e)
        }
    }

    private fun unregisterNoisyReceiverSafely() {
        if (!isNoisyReceiverRegistered) return
        try {
            unregisterReceiver(noisyReceiver)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "noisyReceiver ya había sido desregistrado previamente", e)
        } catch (e: Throwable) {
            Log.e(TAG, "Error al desregistrar noisyReceiver", e)
        } finally {
            isNoisyReceiverRegistered = false
        }
    }

    private fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun promoteToForegroundSafely(channelId: String): Boolean {
        if (!hasMicrophonePermission()) {
            Log.w(TAG, "Permiso RECORD_AUDIO no concedido. Se aborta startForeground para evitar SecurityException en Android 14+.")
            return false
        }

        val notification = buildForegroundNotification(channelId)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            _isServiceRunning.value = true
            true
        } catch (secEx: SecurityException) {
            Log.e(TAG, "SecurityException al iniciar Foreground Service de micrófono en Android 14+", secEx)
            _isServiceRunning.value = false
            false
        } catch (e: Throwable) {
            Log.e(TAG, "Excepción inesperada en startForeground (ForegroundServiceStartNotAllowedException u otra)", e)
            _isServiceRunning.value = false
            false
        }
    }

    private fun stopPttForegroundSafely() {
        try {
            stopTransmission()
            _activeChannelId.value = null
            _isServiceRunning.value = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error al detener Foreground Service", e)
        } finally {
            stopSelf()
        }
    }

    override fun joinChannel(channelId: String) {
        _activeChannelId.value = channelId
    }

    override fun leaveChannel() {
        stopTransmission()
        _activeChannelId.value = null
    }

    override fun startTransmission() {
        if (!hasMicrophonePermission()) {
            Log.w(TAG, "Intento de transmitir sin permiso RECORD_AUDIO bloqueado preventivamente.")
            return
        }
        _isTransmitting.value = true
    }

    override fun stopTransmission() {
        _isTransmitting.value = false
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SmarTalk PTT Activo",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Canal prioritario de radiocomunicación PTT en tiempo real (AR Group 2026)"
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(channelId: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val contentPendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, pendingFlags)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("SmarTalk PTT — Canal $channelId")
            .setContentText("Enlace de voz activo • AR Group 2026")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(contentPendingIntent)
            .build()
    }

    override fun onDestroy() {
        stopTransmission()
        unregisterNoisyReceiverSafely()
        _isServiceRunning.value = false
        super.onDestroy()
    }
}
