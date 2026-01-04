import { Wifi, WifiOff, AlertTriangle, RefreshCw } from "lucide-react";
import { useWhatsAppConnections } from "@/hooks/useWhatsAppConnections";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface ChatConnectionIndicatorProps {
  connectionId?: string | null;
}

export function ChatConnectionIndicator({ connectionId }: ChatConnectionIndicatorProps) {
  const navigate = useNavigate();
  const { connections, isLoading, checkStatus } = useWhatsAppConnections();

  if (isLoading || !connections || connections.length === 0) {
    return null;
  }

  // If we have a specific connection ID, show status for that connection
  // Otherwise, show status of the default/first connected one
  const connection = connectionId 
    ? connections.find(c => c.id === connectionId)
    : connections.find(c => c.is_default && c.status === 'connected') || 
      connections.find(c => c.status === 'connected') ||
      connections[0];

  if (!connection) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate("/conexoes")}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
            >
              <WifiOff className="w-3 h-3" />
              <span className="hidden sm:inline">Sem conexão</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Nenhuma conexão WhatsApp disponível</p>
            <p className="text-xs text-muted-foreground">Clique para configurar</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isConnected = connection.status === 'connected';
  const isConnecting = connection.status === 'connecting';

  const handleClick = () => {
    if (!isConnected) {
      navigate("/conexoes");
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
              isConnected 
                ? "bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20" 
                : isConnecting
                  ? "bg-warning/10 text-warning hover:bg-warning/20"
                  : "bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer"
            )}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">{connection.name}</span>
              </>
            ) : isConnecting ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Conectando...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">Desconectado</span>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isConnected ? (
            <div className="text-xs">
              <p className="font-medium">WhatsApp conectado</p>
              <p className="text-muted-foreground">
                {connection.name} • {connection.phone_number || 'Número não identificado'}
              </p>
            </div>
          ) : isConnecting ? (
            <div className="text-xs">
              <p className="font-medium">Conectando WhatsApp...</p>
              <p className="text-muted-foreground">{connection.name}</p>
            </div>
          ) : (
            <div className="text-xs">
              <p className="font-medium text-destructive">WhatsApp desconectado</p>
              <p className="text-muted-foreground">Clique para reconectar</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

