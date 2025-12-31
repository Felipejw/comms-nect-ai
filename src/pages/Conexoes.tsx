import { useState, useEffect } from "react";
import { QrCode, Smartphone, RefreshCw, Wifi, WifiOff, Plus, Trash2, Power, Loader2, Server, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWhatsAppConnections, WhatsAppConnection } from "@/hooks/useWhatsAppConnections";
import { useToast } from "@/hooks/use-toast";

export default function Conexoes() {
  const [newInstanceName, setNewInstanceName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<WhatsAppConnection | null>(null);
  const [pollingConnection, setPollingConnection] = useState<string | null>(null);
  const [serverHealth, setServerHealth] = useState<{ apiReachable?: boolean; instanceCount?: number } | null>(null);
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
    checkServerHealth,
    cleanupOrphaned,
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
        setRecreateAttempts({});
        setPollCount(0);
        setQrError(null);
        toast({
          title: "WhatsApp conectado!",
          description: `Dispositivo ${connection.name} conectado com sucesso.`,
        });
        return;
      }

      // If connecting but no QR code, track attempts but DON'T auto-recreate
      if (connection.status === "connecting" && !connection.qr_code) {
        const attempts = recreateAttempts[pollingConnection] || 0;
        
        if (attempts >= 5) {
          // Stop polling and show error - let user manually retry
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

      // Check status
      await checkStatus.mutateAsync(pollingConnection).catch(() => {});
      
      // Refresh connections
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
      
      // Find the new connection and start polling
      await refetch();
      if (result.connection) {
        setSelectedConnection(result.connection);
        setPollingConnection(result.connection.id);
        
        console.log("QR Code received from create:", result.qrCode ? "Yes" : "No");
        
        // If no QR code came with create, fetch it immediately
        if (!result.qrCode) {
          console.log("[Create] No QR code in response, fetching...");
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
      // Clear error state and recreate instance
      setQrError(null);
      setRecreateAttempts({});
      setPollCount(0);
      await recreateConnection.mutateAsync(connection.id);
      setPollingConnection(connection.id);
      refetch();
    } catch (error) {
      console.error("Error refreshing QR code:", error);
      setQrError("Erro ao recriar instância. Verifique se o servidor Evolution API está acessível.");
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

  const handleCheckServerHealth = async () => {
    try {
      const result = await checkServerHealth.mutateAsync();
      setServerHealth(result.health);
      
      if (result.health?.apiReachable) {
        toast({
          title: "Servidor Evolution API",
          description: `Conectado! ${result.health.instanceCount || 0} instância(s) no servidor.`,
        });
      } else {
        toast({
          title: "Servidor não acessível",
          description: "Verifique se o servidor Evolution API está rodando e acessível.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error checking server health:", error);
      toast({
        title: "Erro ao verificar servidor",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleCleanupOrphaned = async () => {
    try {
      await cleanupOrphaned.mutateAsync();
    } catch (error) {
      console.error("Error cleaning up:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Online</Badge>;
      case "connecting":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Aguardando QR</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="secondary">Desconectado</Badge>;
    }
  };

  const pendingConnection = connections.find(c => c.status === "connecting");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="w-7 h-7" />
            Conexões
          </h2>
          <p className="text-muted-foreground">Gerencie suas conexões de WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleCheckServerHealth}
            disabled={checkServerHealth.isPending}
            className="gap-2"
          >
            {checkServerHealth.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Server className="w-4 h-4" />
            )}
            Verificar Servidor
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nova Conexão
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
                >
                  {createConnection.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar Instância
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Server Health Alert */}
      {serverHealth && !serverHealth.apiReachable && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Servidor Evolution API não acessível</p>
              <p className="text-sm text-muted-foreground">
                Verifique se o servidor está rodando e se as variáveis EVOLUTION_API_URL e EVOLUTION_API_KEY estão configuradas corretamente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            {pendingConnection || qrError ? (
              <>
                <div className="w-64 h-64 rounded-2xl bg-white flex items-center justify-center mb-6 p-2 relative">
                  {qrError ? (
                    <div className="flex flex-col items-center gap-2 text-destructive p-4 text-center">
                      <AlertTriangle className="w-12 h-12" />
                      <span className="text-sm font-medium">Erro ao gerar QR Code</span>
                      <span className="text-xs text-muted-foreground">
                        {qrError}
                      </span>
                    </div>
                  ) : pendingConnection?.qr_code ? (
                    <img 
                      src={pendingConnection.qr_code} 
                      alt="QR Code" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-12 h-12 animate-spin" />
                      <span className="text-sm">Gerando QR Code...</span>
                      <span className="text-xs text-center mt-2">
                        Aguardando resposta do servidor...
                      </span>
                      {pollCount > 0 && (
                        <span className="text-xs text-yellow-500">
                          Verificação #{pollCount}/5 em andamento
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2">{pendingConnection?.name || "Conexão"}</h3>
                <p className="text-muted-foreground text-center text-sm mb-4">
                  {qrError 
                    ? "Não foi possível gerar o QR Code. Tente novamente ou verifique o servidor."
                    : "Escaneie o QR Code com seu WhatsApp para conectar"
                  }
                </p>
                {!qrError && (
                  <p className="text-xs text-yellow-500 mb-4">
                    ⚠️ O QR Code expira em ~40 segundos. Clique em "Reconectar" para gerar um novo.
                  </p>
                )}
                <div className="flex gap-2">
                  {pendingConnection && (
                    <Button 
                      variant={qrError ? "default" : "outline"}
                      onClick={() => handleRefreshQrCode(pendingConnection)}
                      disabled={recreateConnection.isPending}
                      className="gap-2"
                    >
                      {recreateConnection.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {qrError ? "Tentar Novamente" : "Reconectar"}
                    </Button>
                  )}
                  {pendingConnection && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir conexão?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A conexão será removida permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(pendingConnection.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {qrError && !pendingConnection && (
                    <Button 
                      variant="outline"
                      onClick={() => setQrError(null)}
                      className="gap-2"
                    >
                      Fechar
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="w-48 h-48 rounded-2xl bg-muted flex items-center justify-center mb-6">
                  <QrCode className="w-24 h-24 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Conectar WhatsApp</h3>
                <p className="text-muted-foreground text-center text-sm mb-4">
                  Clique em "Nova Conexão" para gerar um QR Code
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Connected Devices Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Dispositivos Conectados
            </CardTitle>
            <CardDescription>Gerencie seus dispositivos vinculados</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : connections.length === 0 ? (
              <div className="text-center py-8">
                <WifiOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum dispositivo conectado</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Crie uma nova conexão para começar
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        connection.status === "connected" 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {connection.status === "connected" ? (
                          <Wifi className="w-5 h-5" />
                        ) : (
                          <WifiOff className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{connection.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {connection.phone_number || "Aguardando conexão"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(connection.status)}
                      {connection.status === "connected" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDisconnect(connection.id)}
                          disabled={disconnect.isPending}
                        >
                          {disconnect.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      {connection.status === "disconnected" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshQrCode(connection)}
                          disabled={recreateConnection.isPending}
                        >
                          {recreateConnection.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
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
                            <AlertDialogAction onClick={() => handleDelete(connection.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Webhook Info */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Webhook</CardTitle>
          <CardDescription>
            Configure este URL no webhook da Evolution API para receber mensagens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-muted font-mono text-sm break-all">
            https://qducanwbpleoceynmend.supabase.co/functions/v1/evolution-webhook
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Configure este endpoint na sua Evolution API para receber eventos de mensagens e status de conexão.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
