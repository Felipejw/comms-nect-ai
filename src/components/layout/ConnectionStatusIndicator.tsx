import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useWhatsAppConnections } from "@/hooks/useWhatsAppConnections";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

export function ConnectionStatusIndicator() {
  const { connections, isLoading } = useWhatsAppConnections();
  const navigate = useNavigate();

  if (isLoading) return null;

  const totalConnections = connections.length;
  const connectedCount = connections.filter(c => c.status === "connected").length;
  const disconnectedConnections = connections.filter(c => c.status === "disconnected");
  const hasDisconnected = disconnectedConnections.length > 0;

  // Se não há conexões cadastradas, não mostra nada
  if (totalConnections === 0) return null;

  const handleClick = () => {
    navigate("/conexoes");
  };

  if (hasDisconnected) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleClick}
          >
            <div className="relative">
              <WifiOff className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
              </span>
            </div>
            <span className="hidden md:inline text-sm font-medium">
              {disconnectedConnections.length} desconectada{disconnectedConnections.length > 1 ? "s" : ""}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Conexões desconectadas
            </p>
            <ul className="text-sm text-muted-foreground">
              {disconnectedConnections.map(c => (
                <li key={c.id}>• {c.name}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Clique para reconectar
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Todas conectadas
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-green-600 hover:text-green-600 hover:bg-green-600/10"
          onClick={handleClick}
        >
          <Wifi className="h-4 w-4" />
          <span className="hidden md:inline text-sm font-medium">
            {connectedCount} conectada{connectedCount > 1 ? "s" : ""}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Todas as conexões WhatsApp estão ativas</p>
      </TooltipContent>
    </Tooltip>
  );
}
