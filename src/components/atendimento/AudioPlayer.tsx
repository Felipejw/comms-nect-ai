import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
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
  const audioRef = useRef<HTMLAudioElement>(null);

  const waveformBars = useMemo(() => generateWaveformBars(40), [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    const handleError = () => {
      console.error("Audio error:", audio.error);
      setIsLoading(false);
      setHasError(true);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setHasError(true);
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || isLoading) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    const newTime = (percentage / 100) * audio.duration;

    audio.currentTime = newTime;
    setProgress(percentage);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const currentTime = audioRef.current?.currentTime || 0;

  if (hasError) {
    return (
      <div className={cn("flex items-center gap-2 p-3 bg-destructive/10 rounded-xl", className)}>
        <span className="text-xs text-destructive">Erro ao carregar áudio</span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline text-primary hover:text-primary/80"
        >
          Abrir em nova aba
        </a>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl min-w-[260px] shadow-sm",
        "bg-muted/40 border border-border/50",
        className
      )}
    >
      <audio ref={audioRef} preload="metadata">
        <source src={src} type="audio/ogg" />
        <source src={src} type="audio/mpeg" />
        <source src={src} type="audio/mp4" />
        <source src={src} type="audio/webm" />
        <source src={src} />
      </audio>

      {/* Play/Pause button */}
      <Button
        variant="default"
        size="icon"
        className="h-10 w-10 shrink-0 rounded-full shadow-sm"
        onClick={togglePlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
        )}
      </Button>

      {/* Waveform + time */}
      <div className="flex-1 flex flex-col gap-1.5">
        <div
          className="relative h-8 flex items-center gap-[2px] cursor-pointer group"
          onClick={handleWaveformClick}
        >
          {waveformBars.map((height, index) => {
            const barProgress = (index / waveformBars.length) * 100;
            const isPlayed = barProgress < progress;

            return (
              <div
                key={index}
                className={cn(
                  "flex-1 rounded-full",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/25",
                  "group-hover:opacity-80"
                )}
                style={{
                  height: `${height * 100}%`,
                  minHeight: "4px",
                  transform:
                    isPlaying
                      ? `scaleY(${1 + Math.sin((Date.now() / 300) + index * 0.5) * 0.15})`
                      : "scaleY(1)",
                  transition: "transform 0.15s ease, background-color 0.2s ease",
                }}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className="flex justify-between px-0.5">
          <span className="text-[11px] font-medium text-foreground/70">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
