import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, RefreshCw, Mic, Image, Video, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/atendimento/AudioPlayer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface MediaAutoDownloaderProps {
  messageId: string;
  conversationId: string;
  sessionName: string;
  mediaType: "audio" | "image" | "video" | "document";
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

const mediaLabels: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  document: "documento",
};

const MediaIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "audio": return <Mic className="w-4 h-4 text-muted-foreground" />;
    case "image": return <Image className="w-4 h-4 text-muted-foreground" />;
    case "video": return <Video className="w-4 h-4 text-muted-foreground" />;
    case "document": return <FileText className="w-4 h-4 text-muted-foreground" />;
    default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
  }
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

  const attemptDownload = useCallback(async () => {
    try {
      console.log(`[MediaAutoDownloader] Attempt ${retryCount.current + 1}/${MAX_RETRIES} for ${mediaType} ${messageId}`);
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
      console.warn(`[MediaAutoDownloader] Attempt ${retryCount.current + 1} failed for ${messageId}:`, err);

      retryCount.current++;
      if (retryCount.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount.current - 1] || 8000;
        console.log(`[MediaAutoDownloader] Retrying in ${delay}ms...`);
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

    return () => {
      cancelledRef.current = true;
    };
  }, [messageId, attemptDownload]);

  const handleManualRetry = () => {
    retryCount.current = 0;
    cancelledRef.current = false;
    setStatus("loading");
    attemptDownload();
  };

  // For audio: show inline player when resolved
  if (mediaType === "audio" && status === "success" && resolvedUrl) {
    return <AudioPlayer src={resolvedUrl} className="mb-2" />;
  }

  // Success for non-audio: parent will re-render with media_url from query invalidation
  if (status === "success") return null;

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          Carregando {mediaLabels[mediaType] || "mídia"}...
        </span>
      </div>
    );
  }

  // Error state
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-2">
      <MediaIcon type={mediaType} />
      <span className="text-sm text-muted-foreground">
        Mensagem de {mediaLabels[mediaType] || "mídia"}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={handleManualRetry}
      >
        <RefreshCw className="w-3 h-3 mr-1" />
        Tentar novamente
      </Button>
    </div>
  );
}
