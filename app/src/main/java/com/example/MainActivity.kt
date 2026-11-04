/* Todos los derechos de desarrollo reservados a AR Group 2026 */
package com.example

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.argroup.smartalk.service.WalkieTalkieService

class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "SmarTalkMainActivity"
    }

    private var walkieTalkieService: WalkieTalkieService? = null
    private var isServiceBound = false
    private var pendingChannelId: String? = null

    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val recordGranted = permissions[Manifest.permission.RECORD_AUDIO] == true
        if (recordGranted) {
            pendingChannelId?.let { channelId ->
                pendingChannelId = null
                startPttService(channelId)
            }
        } else {
            Log.w(TAG, "Permiso RECORD_AUDIO denegado por el usuario. No se iniciará el Foreground Service PTT.")
            pendingChannelId = null
        }
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as? WalkieTalkieService.LocalBinder
            walkieTalkieService = binder?.getService()
            isServiceBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            walkieTalkieService = null
            isServiceBound = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    /**
     * Inicia el servicio PTT de forma blindada en Android 14+ (TargetSDK 36).
     * Verifica previamente RECORD_AUDIO y captura ForegroundServiceStartNotAllowedException / SecurityException.
     */
    fun startPttService(channelId: String) {
        try {
            val hasMicPermission = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasMicPermission) {
                Log.w(TAG, "Solicitando permiso RECORD_AUDIO antes de invocar startForegroundService para canal: $channelId")
                pendingChannelId = channelId
                val permissionsToRequest = mutableListOf(Manifest.permission.RECORD_AUDIO)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
                }
                audioPermissionLauncher.launch(permissionsToRequest.toTypedArray())
                return
            }

            val serviceIntent = Intent(this, WalkieTalkieService::class.java).apply {
                action = WalkieTalkieService.ACTION_START_PTT
                putExtra(WalkieTalkieService.EXTRA_CHANNEL_ID, channelId)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, serviceIntent)
            } else {
                startService(serviceIntent)
            }

            if (!isServiceBound) {
                bindService(serviceIntent, serviceConnection, Context.BIND_AUTO_CREATE)
            }
        } catch (e: Throwable) {
            Log.e(
                TAG,
                "Excepción controlada al iniciar WalkieTalkieService (ForegroundServiceStartNotAllowedException / SecurityException en Android 14+)",
                e
            )
        }
    }

    /**
     * Detiene y desvincula el servicio PTT de forma segura sin riesgo de IllegalArgumentException ni crashes en Android 14+.
     */
    fun stopPttService() {
        try {
            if (isServiceBound) {
                try {
                    unbindService(serviceConnection)
                } catch (unbindEx: IllegalArgumentException) {
                    Log.w(TAG, "El servicio WalkieTalkieService no estaba vinculado al momento de unbindService", unbindEx)
                } finally {
                    isServiceBound = false
                    walkieTalkieService = null
                }
            }

            val stopIntent = Intent(this, WalkieTalkieService::class.java).apply {
                action = WalkieTalkieService.ACTION_STOP_PTT
            }
            stopService(stopIntent)
        } catch (e: Throwable) {
            Log.e(TAG, "Excepción controlada al detener WalkieTalkieService", e)
        }
    }

    override fun onDestroy() {
        if (isServiceBound) {
            try {
                unbindService(serviceConnection)
            } catch (_: Throwable) {
            } finally {
                isServiceBound = false
                walkieTalkieService = null
            }
        }
        super.onDestroy()
    }
}
