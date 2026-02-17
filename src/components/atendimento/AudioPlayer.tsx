import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  className?: string;
}

const generateWaveformBars = (count: number): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = 0.3 + Math.random() * 0.4;
    const wave = Math.sin(i * 0.3) * 0.2;
    bars.push(Math.min(1, Math.max(0.15, base + wave)));
  }
  return bars;
};

export function AudioPlayer({ src, className }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const waveformBars = useMemo(() => generateWaveformBars(40), [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onMeta = () => { setDuration(audio.duration); setIsLoading(false); setHasError(false); };
    const onTime = () => { if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100); };
    const onEnd = () => { setIsPlaying(false); setProgress(0); };
    const onError = () => { setIsLoading(false); setHasError(true); };
    const onCanPlay = () => { setIsLoading(false); };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) { audio.pause(); setIsPlaying(false); }
      else { await audio.play(); setIsPlaying(true); }
    } catch { setHasError(true); }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || isLoading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    audio.currentTime = (pct / 100) * audio.duration;
    setProgress(pct);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  };

  const formatTime = (t: number) => {
    if (!isFinite(t) || isNaN(t)) return "0:00";
    return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;
  };

  const currentTime = audioRef.current?.currentTime || 0;

  if (hasError) {
    return (
      <div className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/10", className)}>
        <div className="w-9 h-9 rounded-full bg-background/60 flex items-center justify-center shrink-0">
          <Play className="w-4 h-4 text-muted-foreground ml-0.5" />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">Áudio</span>
          <span className="text-xs text-muted-foreground">Erro ao carregar</span>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline text-primary hover:text-primary/80 shrink-0"
        >
          Abrir
        </a>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 min-w-[260px]", className)}>
      <audio ref={audioRef} preload="metadata">
        <source src={src} type="audio/ogg" />
        <source src={src} type="audio/mpeg" />
        <source src={src} type="audio/mp4" />
        <source src={src} type="audio/webm" />
        <source src={src} />
      </audio>

      {/* Play/Pause */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
        onClick={togglePlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>

      {/* Waveform */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="relative h-7 flex items-center gap-[1.5px] cursor-pointer group"
          onClick={handleWaveformClick}
        >
          {waveformBars.map((height, index) => {
            const barPct = (index / waveformBars.length) * 100;
            const isPlayed = barPct < progress;

            return (
              <div
                key={index}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-150",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/25",
                  "group-hover:opacity-90"
                )}
                style={{
                  height: `${height * 100}%`,
                  minHeight: '3px',
                }}
              />
            );
          })}
        </div>

        <div className="flex justify-between px-0.5">
          <span className="text-[10px] text-muted-foreground font-medium">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Mute */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-full"
        onClick={toggleMute}
      >
        {isMuted ? (
          <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}
