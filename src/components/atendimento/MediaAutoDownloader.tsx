import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, RefreshCw, Mic, Image, Video, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/atendimento/AudioPlayer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface MediaAutoDownloaderProps {
  messageId: string;
  conversationId: string;
  sessionName: string;
  mediaType: "audio" | "image" | "video" | "document";
}

const MAX_RETRIES = 2;
const RETRY_DELAYS = [3000, 6000];
const GIVE_UP_TIMEOUT = 15000;

const mediaConfig: Record<string, { label: string; icon: typeof Mic; bgClass: string }> = {
  audio: { label: "Áudio", icon: Mic, bgClass: "bg-emerald-500/10" },
  image: { label: "Imagem", icon: Image, bgClass: "bg-blue-500/10" },
  video: { label: "Vídeo", icon: Video, bgClass: "bg-purple-500/10" },
  document: { label: "Documento", icon: FileText, bgClass: "bg-amber-500/10" },
};

export function MediaAutoDownloader({
  messageId,
  conversationId,
  sessionName,
  mediaType,
}: MediaAutoDownloaderProps) {
  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const retryCount = useRef(0);
  const cancelledRef = useRef(false);
  const queryClient = useQueryClient();
  const config = mediaConfig[mediaType] || mediaConfig.document;
  const IconComponent = config.icon;

  const attemptDownload = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("download-whatsapp-media", {
        body: { messageId, mediaType, sessionName },
      });

      if (cancelledRef.current) return;
      if (error) throw error;

      if (data?.success && data?.url) {
        await supabase.from("messages").update({ media_url: data.url }).eq("id", messageId);
        setResolvedUrl(data.url);
        setStatus("success");
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        return;
      }
      throw new Error("No URL returned");
    } catch (err) {
      if (cancelledRef.current) return;
      retryCount.current++;
      if (retryCount.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount.current - 1] || 8000;
        setTimeout(() => {
          if (!cancelledRef.current) attemptDownload();
        }, delay);
      } else {
        setStatus("error");
      }
    }
  }, [messageId, mediaType, sessionName, conversationId, queryClient]);

  useEffect(() => {
    cancelledRef.current = false;
    retryCount.current = 0;
    setStatus("loading");
    setResolvedUrl(null);
    attemptDownload();

    const safetyTimer = setTimeout(() => {
      if (!cancelledRef.current && status === "loading") {
        setStatus("error");
      }
    }, GIVE_UP_TIMEOUT);

    return () => {
      cancelledRef.current = true;
      clearTimeout(safetyTimer);
    };
  }, [messageId, attemptDownload]);

  const handleManualRetry = () => {
    retryCount.current = 0;
    cancelledRef.current = false;
    setStatus("loading");
    attemptDownload();
  };

  if (mediaType === "audio" && status === "success" && resolvedUrl) {
    return <AudioPlayer src={resolvedUrl} className="mb-1" />;
  }

  if (status === "success") return null;

  if (status === "loading") {
    return (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1",
        config.bgClass
      )}>
        <div className="w-9 h-9 rounded-full bg-background/60 flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-foreground">{config.label}</span>
          <span className="text-xs text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  // Error / fallback state
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1",
      config.bgClass
    )}>
      <div className="w-9 h-9 rounded-full bg-background/60 flex items-center justify-center shrink-0">
        <IconComponent className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{config.label}</span>
        <span className="text-xs text-muted-foreground">Não foi possível carregar</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2.5 text-xs rounded-lg shrink-0 hover:bg-background/60"
        onClick={handleManualRetry}
      >
        <RefreshCw className="w-3 h-3 mr-1" />
        Tentar
      </Button>
    </div>
  );
}
