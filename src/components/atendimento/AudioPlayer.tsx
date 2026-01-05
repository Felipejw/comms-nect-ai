import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  className?: string;
}

// Generate random waveform bars (simulated since we can't do real audio analysis cross-origin)
const generateWaveformBars = (count: number): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Create a natural-looking waveform pattern
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
  
  // Generate waveform bars once per audio source
  const waveformBars = useMemo(() => generateWaveformBars(32), [src]);

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

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
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
      <div className={cn("flex items-center gap-2 p-3 bg-destructive/10 rounded-lg", className)}>
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
    <div className={cn("flex items-center gap-2 p-2 bg-muted/50 rounded-lg min-w-[240px]", className)}>
      {/* Hidden audio element with multiple source types */}
      <audio ref={audioRef} preload="metadata">
        <source src={src} type="audio/ogg" />
        <source src={src} type="audio/mpeg" />
        <source src={src} type="audio/mp4" />
        <source src={src} type="audio/webm" />
        <source src={src} />
      </audio>

      {/* Play/Pause button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full bg-primary/10 hover:bg-primary/20"
        onClick={togglePlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 text-primary" />
        ) : (
          <Play className="h-4 w-4 text-primary ml-0.5" />
        )}
      </Button>

      {/* Waveform visualization */}
      <div className="flex-1 flex flex-col gap-1">
        <div 
          className="relative h-8 flex items-center gap-[2px] cursor-pointer group"
          onClick={handleWaveformClick}
        >
          {waveformBars.map((height, index) => {
            const barProgress = (index / waveformBars.length) * 100;
            const isPlayed = barProgress < progress;
            const isActive = Math.abs(barProgress - progress) < (100 / waveformBars.length);
            
            return (
              <div
                key={index}
                className={cn(
                  "flex-1 rounded-full transition-all duration-150",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/30",
                  isActive && isPlaying && "animate-pulse",
                  "group-hover:opacity-80"
                )}
                style={{
                  height: `${height * 100}%`,
                  minHeight: '4px',
                  transform: isPlaying && isActive ? 'scaleY(1.2)' : 'scaleY(1)',
                  transition: 'transform 0.1s ease, background-color 0.15s ease'
                }}
              />
            );
          })}
          
          {/* Progress indicator line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-sm pointer-events-none transition-all duration-100"
            style={{ left: `${progress}%` }}
          />
        </div>
        
        {/* Time display */}
        <div className="flex justify-between px-0.5">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Mute button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
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
