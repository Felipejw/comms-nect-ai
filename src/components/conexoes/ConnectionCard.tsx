import { useState, useEffect, useRef } from "react";
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
  Pencil,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

const CONNECTION_COLORS = [
  { value: '#22c55e', label: 'Verde' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#8b5cf6', label: 'Roxo' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#06b6d4', label: 'Ciano' },
  { value: '#eab308', label: 'Amarelo' },
  { value: '#ef4444', label: 'Vermelho' },
];

interface ConnectionCardProps {
  connection: WhatsAppConnection;
  isPolling: boolean;
  onDisconnect: (id: string) => void;
  onDelete: (id: string) => void;
  onRefreshQr: (connection: WhatsAppConnection) => void;
  onViewQr: (connection: WhatsAppConnection) => void;
  onUpdateName: (id: string, name: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  isDisconnecting: boolean;
  isRecreating: boolean;
  isDeleting: boolean;
  isUpdating: boolean;
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
  onUpdateName,
  onUpdateColor,
  isDisconnecting,
  isRecreating,
  isDeleting,
  isUpdating,
}: ConnectionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingColor, setIsEditingColor] = useState(false);
  const [editName, setEditName] = useState(connection.name);
  const [prevStatus, setPrevStatus] = useState(connection.status);
  const [statusChanged, setStatusChanged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = connection.name.charAt(0).toUpperCase();
  
  const formattedDate = connection.created_at 
    ? format(new Date(connection.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "-";

  // Detect status changes for animation
  useEffect(() => {
    if (prevStatus !== connection.status) {
      setStatusChanged(true);
      setPrevStatus(connection.status);
      const timer = setTimeout(() => setStatusChanged(false), 500);
      return () => clearTimeout(timer);
    }
  }, [connection.status, prevStatus]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditName(connection.name);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditName(connection.name);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editName.trim() !== connection.name) {
      onUpdateName(connection.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const getStatusIndicator = () => {
    const baseClasses = cn(
      "transition-all duration-300",
      statusChanged && "animate-scale-in"
    );

    switch (connection.status) {
      case "connected":
        return (
          <div className={cn(baseClasses, "flex items-center gap-2 text-emerald-500")}>
            <Wifi className="w-4 h-4" />
            <span className="text-sm font-medium">Conectado</span>
          </div>
        );
      case "connecting":
        return (
          <div className={cn(baseClasses, "space-y-2")}>
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
          <div className={cn(baseClasses, "flex items-center gap-2 text-destructive")}>
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
            className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-all duration-200 hover:scale-[1.02]"
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
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-200 hover:scale-[1.02]"
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
              className="flex-1 transition-all duration-200 hover:scale-[1.02]"
              onClick={() => onRefreshQr(connection)}
              disabled={isRecreating}
            >
              {isRecreating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              RECONECTAR
            </Button>
            <Button 
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-200 hover:scale-[1.02]"
              onClick={() => onRefreshQr(connection)}
              disabled={isRecreating}
            >
              <QrCode className="w-4 h-4 mr-2" />
              NOVO QR
            </Button>
          </div>
        );
    }
  };

  const handleColorChange = (color: string) => {
    onUpdateColor(connection.id, color);
    setIsEditingColor(false);
  };

  const connectionColor = connection.color || '#22c55e';

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in">
      {/* Color indicator bar */}
      <div 
        className="h-1.5 w-full" 
        style={{ backgroundColor: connectionColor }}
      />
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 transition-transform duration-300 cursor-pointer hover:scale-105"
              style={{ backgroundColor: connectionColor }}
              onClick={() => setIsEditingColor(!isEditingColor)}
              title="Clique para mudar a cor"
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-8 text-sm"
                    placeholder="Nome da conexão"
                  />
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                    onClick={handleSaveEdit}
                    disabled={isUpdating}
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={handleCancelEdit}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-foreground truncate">{connection.name}</h3>
                  <p className="text-xs text-muted-foreground">ID: {connection.id.slice(0, 8)}...</p>
                </>
              )}
            </div>
          </div>
          {connection.is_default && !isEditing && (
            <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 flex-shrink-0">
              Padrão
            </Badge>
          )}
        </div>

        {/* Color Picker */}
        {isEditingColor && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg animate-fade-in">
            <p className="text-xs text-muted-foreground mb-2">Selecione uma cor:</p>
            <div className="flex flex-wrap gap-2">
              {CONNECTION_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleColorChange(c.value)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all hover:scale-110 border-2",
                    connectionColor === c.value ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="mb-4">
          {getStatusIndicator()}
        </div>

        {/* Info */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Número: {connection.phone_number || "Não conectado"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span>Data: {formattedDate}</span>
          </div>
        </div>

        {/* Primary Action */}
        <div className="mb-4">
          {getPrimaryAction()}
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-foreground transition-colors duration-200"
            onClick={handleStartEdit}
            disabled={isEditing}
          >
            <Pencil className="w-4 h-4 mr-1" />
            EDITAR
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                EXCLUIR
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="animate-scale-in">
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
