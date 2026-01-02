import { useState, useEffect } from "react";
import { QrCode, Plus, Loader2, AlertTriangle, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWhatsAppConnections, WhatsAppConnection } from "@/hooks/useWhatsAppConnections";
import { useToast } from "@/hooks/use-toast";
import { ConnectionCard } from "@/components/conexoes/ConnectionCard";

export default function Conexoes() {
  const [newInstanceName, setNewInstanceName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<WhatsAppConnection | null>(null);
  const [pollingConnection, setPollingConnection] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const { toast } = useToast();

  const {
    connections,
    isLoading,
    refetch,
    createConnection,
    getQrCode,
    checkStatus,
    disconnect,
    deleteConnection,
    recreateConnection,
  } = useWhatsAppConnections();

  const [recreateAttempts, setRecreateAttempts] = useState<Record<string, number>>({});
  const [pollCount, setPollCount] = useState(0);
  const [qrError, setQrError] = useState<string | null>(null);
  
  // Polling for QR code and status updates
  useEffect(() => {
    if (!pollingConnection) return;

    const interval = setInterval(async () => {
      setPollCount(prev => prev + 1);
      
      const connection = connections.find(c => c.id === pollingConnection);
      
      if (!connection) {
        setPollingConnection(null);
        setPollCount(0);
        return;
      }

      if (connection.status === "connected") {
        setPollingConnection(null);
        setSelectedConnection(null);
        setIsQrModalOpen(false);
        setRecreateAttempts({});
        setPollCount(0);
        setQrError(null);
        toast({
          title: "WhatsApp conectado!",
          description: `Dispositivo ${connection.name} conectado com sucesso.`,
        });
        return;
      }

      // If connecting but no QR code, track attempts
      if (connection.status === "connecting" && !connection.qr_code) {
        const attempts = recreateAttempts[pollingConnection] || 0;
        
        if (attempts >= 5) {
          console.log("[Polling] No QR after 5 attempts, stopping and showing error");
          setQrError("O servidor não conseguiu gerar o QR Code. Clique em 'Tentar Novamente' para recriar a instância.");
          setPollingConnection(null);
          setPollCount(0);
          return;
        } else {
          setRecreateAttempts(prev => ({ ...prev, [pollingConnection]: attempts + 1 }));
          console.log(`[Polling] No QR code, attempt ${attempts + 1}/5`);
        }
      }

      await checkStatus.mutateAsync(pollingConnection).catch(() => {});
      refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingConnection, connections, checkStatus, refetch, recreateAttempts, toast]);

  const handleCreateConnection = async () => {
    if (!newInstanceName.trim()) return;

    try {
      const result = await createConnection.mutateAsync(newInstanceName.trim());
      setIsCreateDialogOpen(false);
      setNewInstanceName("");
      
      await refetch();
      if (result.connection) {
        setSelectedConnection(result.connection);
        setPollingConnection(result.connection.id);
        setIsQrModalOpen(true);
        
        if (!result.qrCode) {
          await getQrCode.mutateAsync(result.connection.id).catch((e) => {
            console.error("[Create] Failed to fetch QR:", e);
          });
          await refetch();
        }
      }
    } catch (error) {
      console.error("Error creating connection:", error);
    }
  };

  const handleRefreshQrCode = async (connection: WhatsAppConnection) => {
    try {
      setQrError(null);
      setRecreateAttempts({});
      setPollCount(0);
      setSelectedConnection(connection);
      setIsQrModalOpen(true);
      await recreateConnection.mutateAsync(connection.id);
      setPollingConnection(connection.id);
      refetch();
    } catch (error) {
      console.error("Error refreshing QR code:", error);
      setQrError("Erro ao recriar instância. Verifique se o servidor Evolution API está acessível.");
    }
  };

  const handleViewQr = (connection: WhatsAppConnection) => {
    setSelectedConnection(connection);
    setIsQrModalOpen(true);
    if (connection.status === "connecting") {
      setPollingConnection(connection.id);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await disconnect.mutateAsync(connectionId);
      setSelectedConnection(null);
      setPollingConnection(null);
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  };

  const handleDelete = async (connectionId: string) => {
    try {
      await deleteConnection.mutateAsync(connectionId);
      setSelectedConnection(null);
      setPollingConnection(null);
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  const currentQrConnection = connections.find(c => c.id === selectedConnection?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="w-7 h-7" />
            Conexões
          </h2>
          <p className="text-muted-foreground">Gerencie suas conexões de WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white">
                <Plus className="w-4 h-4" />
                ADICIONAR WHATSAPP
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
                <DialogDescription>
                  Crie uma nova instância para conectar um número de WhatsApp
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="instanceName">Nome da Instância</Label>
                  <Input
                    id="instanceName"
                    placeholder="Ex: Atendimento Principal"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateConnection} 
                  disabled={!newInstanceName.trim() || createConnection.isPending}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {createConnection.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar Instância
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Connection Count */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Smartphone className="w-4 h-4" />
        <span>Todos os WhatsApp's · {connections.length} conexões</span>
      </div>

      {/* Connections Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <QrCode className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Nenhuma conexão</h3>
          <p className="text-muted-foreground mb-4">
            Clique em "Adicionar WhatsApp" para criar sua primeira conexão
          </p>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar WhatsApp
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              isPolling={pollingConnection === connection.id}
              onDisconnect={handleDisconnect}
              onDelete={handleDelete}
              onRefreshQr={handleRefreshQrCode}
              onViewQr={handleViewQr}
              isDisconnecting={disconnect.isPending}
              isRecreating={recreateConnection.isPending}
              isDeleting={deleteConnection.isPending}
            />
          ))}
        </div>
      )}

      {/* QR Code Modal */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">
              {currentQrConnection?.name || "Conexão"}
            </DialogTitle>
            <DialogDescription className="text-center">
              Escaneie o QR Code com seu WhatsApp para conectar
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center py-4">
            <div className="w-64 h-64 rounded-xl bg-white flex items-center justify-center p-2">
              {qrError ? (
                <div className="flex flex-col items-center gap-2 text-destructive p-4 text-center">
                  <AlertTriangle className="w-12 h-12" />
                  <span className="text-sm font-medium">Erro ao gerar QR Code</span>
                  <span className="text-xs text-muted-foreground">{qrError}</span>
                </div>
              ) : currentQrConnection?.qr_code ? (
                <img 
                  src={currentQrConnection.qr_code} 
                  alt="QR Code" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-12 h-12 animate-spin" />
                  <span className="text-sm">Gerando QR Code...</span>
                  {pollCount > 0 && (
                    <span className="text-xs text-amber-500">
                      Verificação #{pollCount}/5
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {!qrError && currentQrConnection?.qr_code && (
              <p className="text-xs text-amber-500 mt-4 text-center">
                ⚠️ O QR Code expira em ~40 segundos. Clique em "Atualizar" para gerar um novo.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {currentQrConnection && (
              <Button 
                variant="outline"
                onClick={() => handleRefreshQrCode(currentQrConnection)}
                disabled={recreateConnection.isPending}
                className="w-full sm:w-auto"
              >
                {recreateConnection.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {qrError ? "Tentar Novamente" : "Atualizar QR"}
              </Button>
            )}
            <Button 
              variant="secondary" 
              onClick={() => setIsQrModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
