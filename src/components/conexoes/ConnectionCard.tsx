import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Wifi, 
  WifiOff, 
  Phone, 
  Calendar, 
  QrCode, 
  Trash2, 
  RefreshCw, 
  Power, 
  Loader2,
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { WhatsAppConnection } from "@/hooks/useWhatsAppConnections";

interface ConnectionCardProps {
  connection: WhatsAppConnection;
  isPolling: boolean;
  onDisconnect: (id: string) => void;
  onDelete: (id: string) => void;
  onRefreshQr: (connection: WhatsAppConnection) => void;
  onViewQr: (connection: WhatsAppConnection) => void;
  isDisconnecting: boolean;
  isRecreating: boolean;
  isDeleting: boolean;
}

// Generate a consistent color based on string
const getAvatarColor = (name: string): string => {
  const colors = [
    "bg-emerald-500",
    "bg-blue-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];
  const hash = name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

export function ConnectionCard({
  connection,
  isPolling,
  onDisconnect,
  onDelete,
  onRefreshQr,
  onViewQr,
  isDisconnecting,
  isRecreating,
  isDeleting,
}: ConnectionCardProps) {
  const initial = connection.name.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(connection.name);
  
  const formattedDate = connection.created_at 
    ? format(new Date(connection.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "-";

  const getStatusIndicator = () => {
    switch (connection.status) {
      case "connected":
        return (
          <div className="flex items-center gap-2 text-emerald-500">
            <Wifi className="w-4 h-4" />
            <span className="text-sm font-medium">Conectado</span>
          </div>
        );
      case "connecting":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-500">
              <QrCode className="w-4 h-4" />
              <span className="text-sm font-medium">QR Code</span>
            </div>
            {isPolling && (
              <Progress value={undefined} className="h-1.5 animate-pulse" />
            )}
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-destructive">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">Desconectado</span>
          </div>
        );
    }
  };

  const getPrimaryAction = () => {
    switch (connection.status) {
      case "connected":
        return (
          <Button 
            className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => onDisconnect(connection.id)}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Power className="w-4 h-4 mr-2" />
            )}
            DESCONECTAR
          </Button>
        );
      case "connecting":
        return (
          <Button 
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => onViewQr(connection)}
          >
            <QrCode className="w-4 h-4 mr-2" />
            QR CODE
          </Button>
        );
      default:
        return (
          <div className="flex gap-2 w-full">
            <Button 
              variant="outline"
              className="flex-1"
              onClick={() => onRefreshQr(connection)}
              disabled={isRecreating}
            >
              {isRecreating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              TENTAR NOVAMENTE
            </Button>
            <Button 
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => onRefreshQr(connection)}
              disabled={isRecreating}
            >
              <QrCode className="w-4 h-4 mr-2" />
              NOVO QR CODE
            </Button>
          </div>
        );
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-lg`}>
              {initial}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{connection.name}</h3>
              <p className="text-xs text-muted-foreground">ID: {connection.id.slice(0, 8)}...</p>
            </div>
          </div>
          {connection.is_default && (
            <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
              Padrão
            </Badge>
          )}
        </div>

        {/* Status */}
        <div className="mb-4">
          {getStatusIndicator()}
        </div>

        {/* Info */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-4 h-4" />
            <span>Número: {connection.phone_number || "Não conectado"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>Data: {formattedDate}</span>
          </div>
        </div>

        {/* Primary Action */}
        <div className="mb-4">
          {getPrimaryAction()}
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Pencil className="w-4 h-4 mr-1" />
            EDITAR
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4 mr-1" />
                EXCLUIR
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir conexão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. A conexão "{connection.name}" será removida permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => onDelete(connection.id)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
