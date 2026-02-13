import { useMemo } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Message {
  id: string;
  message_type: string;
  media_url?: string | null;
}

interface AudioProcessingStatusProps {
  messages: Message[];
}

export function AudioProcessingStatus({ messages }: AudioProcessingStatusProps) {
  const { pending, ready } = useMemo(() => {
    let pending = 0;
    let ready = 0;
    for (const msg of messages) {
      if (msg.message_type === "audio") {
        if (msg.media_url) ready++;
        else pending++;
      }
    }
    return { pending, ready };
  }, [messages]);

  if (pending === 0) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/60 border-b border-border text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span>
          {pending} {pending === 1 ? "áudio sendo processado" : "áudios sendo processados"}...
        </span>
      </div>
      {ready > 0 && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          <span>{ready} {ready === 1 ? "áudio pronto" : "áudios prontos"}</span>
        </div>
      )}
    </div>
  );
}
