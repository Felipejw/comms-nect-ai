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

const MAX_RETRIES = 2;
const RETRY_DELAYS = [3000, 6000];
const GIVE_UP_TIMEOUT = 15000;

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

/** Try downloading media directly from the Baileys server and uploading to local storage */
async function tryDirectBaileysDownload(
  messageId: string,
  mediaType: string,
  sessionName: string,
): Promise<string | null> {
  try {
    // Get Baileys server URL from system_settings
    const { data: urlSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    if (!urlSetting?.value) {
      console.log("[MediaAutoDownloader] No baileys_server_url configured, skipping direct download");
      return null;
    }

    const baileysUrl = urlSetting.value.replace(/\/$/, "");

    // Get API key if configured
    const { data: keySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const headers: Record<string, string> = {};
    if (keySetting?.value) {
      headers["X-API-Key"] = keySetting.value;
    }

    console.log(`[MediaAutoDownloader] Trying direct Baileys download: ${baileysUrl}/sessions/${sessionName}/messages/${messageId}/media`);

    const response = await fetch(
      `${baileysUrl}/sessions/${sessionName}/messages/${messageId}/media`,
      { method: "GET", headers },
    );

    if (!response.ok) {
      console.warn(`[MediaAutoDownloader] Direct Baileys download failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    let mediaBlob: Blob;
    let finalMimetype = "application/octet-stream";

    if (contentType.includes("application/json")) {
      const json = await response.json();
      if (!json.base64) return null;
      const binary = atob(json.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      finalMimetype = json.mimetype || "application/octet-stream";
      mediaBlob = new Blob([bytes], { type: finalMimetype });
    } else {
      mediaBlob = await response.blob();
      finalMimetype = contentType.split(";")[0].trim() || "application/octet-stream";
    }

    // Determine extension
    const extMap: Record<string, string> = {
      "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "video/mp4": "mp4", "application/pdf": "pdf",
    };
    const ext = extMap[finalMimetype] || mediaType || "bin";
    const storagePath = `${sessionName}/${messageId}.${ext}`;

    console.log(`[MediaAutoDownloader] Uploading ${mediaBlob.size} bytes to storage: ${storagePath}`);

    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(storagePath, mediaBlob, { contentType: finalMimetype, upsert: true });

    if (uploadError) {
      console.warn("[MediaAutoDownloader] Storage upload failed:", uploadError.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("[MediaAutoDownloader] Direct Baileys download error:", err);
    return null;
  }
}

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

  const handleSuccess = useCallback(async (url: string) => {
    await supabase.from("messages").update({ media_url: url }).eq("id", messageId);
    setResolvedUrl(url);
    setStatus("success");
    queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
  }, [messageId, conversationId, queryClient]);

  const attemptDownload = useCallback(async () => {
    try {
      console.log(`[MediaAutoDownloader] Attempt ${retryCount.current + 1}/${MAX_RETRIES} for ${mediaType} ${messageId}`);

      // 1. Try direct Baileys download first (works when browser can reach VPS)
      const directUrl = await tryDirectBaileysDownload(messageId, mediaType, sessionName);
      if (cancelledRef.current) return;
      if (directUrl) {
        await handleSuccess(directUrl);
        return;
      }

      // 2. Fallback: edge function
      const { data, error } = await supabase.functions.invoke("download-whatsapp-media", {
        body: { messageId, mediaType, sessionName },
      });

      if (cancelledRef.current) return;
      if (error) throw error;

      if (data?.success && data?.url) {
        await handleSuccess(data.url);
        return;
      }
      throw new Error("No URL returned");
    } catch (err) {
      if (cancelledRef.current) return;
      console.warn(`[MediaAutoDownloader] Attempt ${retryCount.current + 1} failed for ${messageId}:`, err);

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
  }, [messageId, mediaType, sessionName, conversationId, queryClient, handleSuccess]);

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
    return <AudioPlayer src={resolvedUrl} className="mb-2" />;
  }

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
