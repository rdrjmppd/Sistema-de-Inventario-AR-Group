import React, { useEffect, useRef, useState } from 'react';
import { Mic, Music, Pause, Play } from 'lucide-react';

// ============================================================================
// REPRODUCTOR NATIVO DE NOTAS DE VOZ / AUDIO WHATSAPP (PATRÓN PURO APURE ERP)
// Convierte Data URLs Base64 en Blob URLs en memoria, con limpieza automática
// (URL.revokeObjectURL) para evitar fugas. Controles táctiles >= 44x44 px.
// ============================================================================

export interface WhatsAppAudioMessagePlayerProps {
  mediaUrl: string;
  mediaMimeType?: string;
  durationSeconds?: number;
  isPtt?: boolean;
  isOutgoing?: boolean;
}

const formatTime = (secs: number): string => {
  if (!secs || Number.isNaN(secs) || secs < 0 || !Number.isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
};

export const WhatsAppAudioMessagePlayer: React.FC<WhatsAppAudioMessagePlayerProps> = ({
  mediaUrl,
  mediaMimeType,
  durationSeconds,
  isPtt = true,
  isOutgoing = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(durationSeconds || 0);
  const [speed, setSpeed] = useState(1);
  const [blobUrl, setBlobUrl] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!mediaUrl) return undefined;
    let url = mediaUrl;
    let created = false;

    if (mediaUrl.startsWith('data:')) {
      try {
        const commaIdx = mediaUrl.indexOf(',');
        const header = mediaUrl.slice(0, commaIdx);
        const payload = mediaUrl.slice(commaIdx + 1);
        const mimeMatch = header.match(/^data:([^;,]+)/);
        const mime = mimeMatch ? mimeMatch[1] : mediaMimeType || 'audio/ogg';
        const bstr = atob(payload);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        url = URL.createObjectURL(blob);
        created = true;
      } catch {
        url = mediaUrl;
      }
    }

    setBlobUrl(url);
    setLoadError(false);

    return () => {
      if (created) URL.revokeObjectURL(url);
    };
  }, [mediaUrl, mediaMimeType]);

  const syncDuration = () => {
    const d = audioRef.current?.duration;
    if (d && !Number.isNaN(d) && Number.isFinite(d)) {
      setDuration(d);
    }
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      return;
    }
    el.playbackRate = speed;
    el.play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        console.warn('[WhatsAppAudioMessagePlayer] No se pudo reproducir el audio:', err);
        setIsPlaying(false);
        setLoadError(true);
      });
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      syncDuration();
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) audioRef.current.currentTime = newTime;
  };

  const toggleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  return (
    <div
      className={`p-2.5 rounded-xl border flex flex-col gap-2 w-full min-w-[220px] max-w-[320px] select-none ${
        isOutgoing
          ? 'bg-emerald-900/50 border-emerald-500/40 text-emerald-50'
          : 'bg-slate-950/80 border-slate-700/80 text-slate-200'
      }`}
    >
      <audio
        ref={audioRef}
        src={blobUrl || mediaUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={syncDuration}
        onEnded={handleEnded}
        onError={() => setLoadError(true)}
        preload="metadata"
      />

      <div className="flex items-center justify-between text-[11px] font-medium opacity-90">
        <div className="flex items-center gap-1.5">
          {isPtt ? (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Music className="w-3.5 h-3.5 text-cyan-400" />
          )}
          <span>{isPtt ? 'Nota de voz' : 'Mensaje de audio'}</span>
        </div>
        <button
          type="button"
          onClick={toggleSpeed}
          className="px-2.5 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/20 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center tabular-nums"
          aria-label={`Velocidad de reproducción ${speed}x`}
        >
          {speed}x
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shadow transition cursor-pointer shrink-0 ${
            isOutgoing
              ? 'bg-white text-emerald-800 hover:bg-emerald-50'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
          }`}
          aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current translate-x-0.5" />
          )}
        </button>

        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Posición de reproducción"
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700/60 accent-emerald-400 focus:outline-none"
          />
          <div className="flex justify-between items-center text-[10px] font-mono tabular-nums opacity-75">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {loadError && (
        <p className="text-[10px] text-amber-300">
          El navegador no pudo decodificar este formato de audio. Descárgalo desde el dispositivo vinculado.
        </p>
      )}
    </div>
  );
};

export default WhatsAppAudioMessagePlayer;
