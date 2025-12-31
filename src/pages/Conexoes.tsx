import { useState, useEffect } from "react";
import { QrCode, Smartphone, RefreshCw, Wifi, WifiOff, Plus, Trash2, Power, Loader2 } from "lucide-react";
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

export default function Conexoes() {
  const [newInstanceName, setNewInstanceName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<WhatsAppConnection | null>(null);
  const [pollingConnection, setPollingConnection] = useState<string | null>(null);

  const {
    connections,
    isLoading,
    refetch,
    createConnection,
    getQrCode,
    checkStatus,
    disconnect,
    deleteConnection,
  } = useWhatsAppConnections();

  // Polling for QR code and status updates
  useEffect(() => {
    if (!pollingConnection) return;

    const interval = setInterval(async () => {
      const connection = connections.find(c => c.id === pollingConnection);
      
      if (!connection) {
        setPollingConnection(null);
        return;
      }

      if (connection.status === "connected") {
        setPollingConnection(null);
        setSelectedConnection(null);
        return;
      }

      // Check status
      await checkStatus.mutateAsync(pollingConnection).catch(() => {});
      
      // Refresh connections
      refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingConnection, connections, checkStatus, refetch]);

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
      }
    } catch (error) {
      console.error("Error creating connection:", error);
    }
  };

  const handleRefreshQrCode = async (connection: WhatsAppConnection) => {
    try {
      await getQrCode.mutateAsync(connection.id);
      setPollingConnection(connection.id);
      refetch();
    } catch (error) {
      console.error("Error refreshing QR code:", error);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Online</Badge>;
      case "qr_code":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Aguardando QR</Badge>;
      default:
        return <Badge variant="secondary">Desconectado</Badge>;
    }
  };

  const pendingConnection = connections.find(c => c.status === "qr_code");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="w-7 h-7" />
            Conexões
          </h2>
          <p className="text-muted-foreground">Gerencie suas conexões de WhatsApp</p>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            {pendingConnection ? (
              <>
                <div className="w-64 h-64 rounded-2xl bg-white flex items-center justify-center mb-6 p-2">
                  {pendingConnection.qr_code ? (
                    <img 
                      src={pendingConnection.qr_code} 
                      alt="QR Code" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-12 h-12 animate-spin" />
                      <span className="text-sm">Gerando QR Code...</span>
                    </div>
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2">{pendingConnection.name}</h3>
                <p className="text-muted-foreground text-center text-sm mb-4">
                  Escaneie o QR Code com seu WhatsApp para conectar
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleRefreshQrCode(pendingConnection)}
                    disabled={getQrCode.isPending}
                    className="gap-2"
                  >
                    {getQrCode.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Atualizar QR
                  </Button>
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
                          disabled={getQrCode.isPending}
                        >
                          {getQrCode.isPending ? (
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
