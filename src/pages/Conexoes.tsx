import { useState, useEffect } from "react";
import { QrCode, Plus, Loader2, AlertTriangle, RefreshCw, Smartphone, Cloud, Server } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWhatsAppConnections, WhatsAppConnection } from "@/hooks/useWhatsAppConnections";
import { useToast } from "@/hooks/use-toast";
import { ConnectionCard } from "@/components/conexoes/ConnectionCard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ServerInfo {
  status: "online" | "offline";
  version?: string;
  engine?: string;
  sessionsCount?: number;
}

export default function Conexoes() {
  const [newInstanceName, setNewInstanceName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<WhatsAppConnection | null>(null);
  const [pollingConnection, setPollingConnection] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoadingServerInfo, setIsLoadingServerInfo] = useState(false);
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
    updateConnection,
    recreateConnection,
    checkServerHealth,
  } = useWhatsAppConnections();

  const [recreateAttempts, setRecreateAttempts] = useState<Record<string, number>>({});
  const [pollCount, setPollCount] = useState(0);
  const [qrError, setQrError] = useState<string | null>(null);

  // Fetch Baileys server info
  const fetchServerInfo = async () => {
    setIsLoadingServerInfo(true);
    try {
      const result = await checkServerHealth.mutateAsync();
      setServerInfo({
        status: result.status === 'ok' ? "online" : "offline",
        version: result.version || "Baileys",
        engine: "Baileys",
        sessionsCount: result.sessions ?? 0,
      });
    } catch (error) {
      console.error("[Conexoes] Error fetching server info:", error);
      setServerInfo({ status: "offline" });
    } finally {
      setIsLoadingServerInfo(false);
    }
  };

  // Fetch server info on mount
  useEffect(() => {
    fetchServerInfo();
  }, []);

  // Sincronizar selectedConnection com a lista de conexões
  useEffect(() => {
    if (selectedConnection) {
      const exists = connections.find(c => c.id === selectedConnection.id);
      if (!exists) {
        // Conexão foi deletada - fechar modal
        setSelectedConnection(null);
        setIsQrModalOpen(false);
        setPollingConnection(null);
      } else if (exists.qr_code !== selectedConnection.qr_code || exists.status !== selectedConnection.status) {
        // Atualizar com dados mais recentes
        setSelectedConnection(exists);
      }
    }
  }, [connections, selectedConnection]);
  
  // Meta API states
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState("");
  const [metaWebhookVerifyToken, setMetaWebhookVerifyToken] = useState("");
  const [isCreatingMeta, setIsCreatingMeta] = useState(false);
  
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

      // If connecting but no QR code, try to fetch it actively
      if (connection.status === "connecting" && !connection.qr_code) {
        const attempts = recreateAttempts[pollingConnection] || 0;
        
        // Try to fetch QR code from server
        console.log(`[Polling] No QR code, attempting to fetch... (attempt ${attempts + 1}/5)`);
        try {
          await getQrCode.mutateAsync(pollingConnection);
          await refetch();
          // Reset attempts on success
          setRecreateAttempts(prev => ({ ...prev, [pollingConnection]: 0 }));
        } catch (qrErr: any) {
          const errorMsg = qrErr?.message || "";
          const isAuthError = errorMsg.includes("API Key inválida") || errorMsg.includes("401");
          
          if (isAuthError) {
            console.log("[Polling] Auth error detected (401), stopping polling immediately");
            setQrError("API Key inválida. A chave configurada no sistema não corresponde à do servidor Baileys. Corrija em Configurações > Opções > Servidor WhatsApp.");
            setPollingConnection(null);
            setPollCount(0);
            return;
          }
          
          console.log(`[Polling] Failed to fetch QR:`, qrErr);
          if (attempts >= 4) {
            console.log("[Polling] No QR after 5 attempts, stopping and showing error");
            setQrError("O servidor não conseguiu gerar o QR Code. Clique em 'Tentar Novamente' para recriar a instância.");
            setPollingConnection(null);
            setPollCount(0);
            return;
          } else {
            setRecreateAttempts(prev => ({ ...prev, [pollingConnection]: attempts + 1 }));
          }
        }
      }

      // Also check status - detect auth errors there too
      try {
        await checkStatus.mutateAsync(pollingConnection);
      } catch (statusErr: any) {
        const statusMsg = statusErr?.message || "";
        if (statusMsg.includes("API Key inválida") || statusMsg.includes("401")) {
          console.log("[Polling] Auth error on status check, stopping polling");
          setQrError("API Key inválida. A chave configurada no sistema não corresponde à do servidor Baileys. Corrija em Configurações > Opções > Servidor WhatsApp.");
          setPollingConnection(null);
          setPollCount(0);
          return;
        }
      }

      refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingConnection, connections, checkStatus, refetch, recreateAttempts, toast]);

  const handleCreateConnection = async () => {
    if (!newInstanceName.trim()) return;

    try {
      const result = await createConnection.mutateAsync({ 
        instanceName: newInstanceName.trim()
      });
      setIsCreateDialogOpen(false);
      setNewInstanceName("");
      
      await refetch();
      if (result.data) {
        setSelectedConnection(result.data);
        setIsQrModalOpen(true);
        // Sempre iniciar polling - QR será buscado via getQrCode
        setPollingConnection(result.data.id);
        console.log("[Create] Connection created, polling started for QR");
      }
    } catch (error) {
      console.error("Error creating connection:", error);
    }
  };

  const handleRefreshQrCode = async (connection: WhatsAppConnection) => {
    // Verificar se conexão ainda existe na lista
    const currentConnection = connections.find(c => c.id === connection.id);
    if (!currentConnection) {
      toast({
        title: "Conexão não encontrada",
        description: "Esta conexão não existe mais. Atualize a página.",
        variant: "destructive",
      });
      setIsQrModalOpen(false);
      setSelectedConnection(null);
      return;
    }
    
    try {
      setQrError(null);
      setRecreateAttempts({});
      setPollCount(0);
      setSelectedConnection(currentConnection);
      setIsQrModalOpen(true);
      await recreateConnection.mutateAsync(currentConnection.id);
      // Sempre iniciar polling - QR será buscado via getQrCode
      setPollingConnection(currentConnection.id);
      console.log("[RefreshQR] Recreate complete, polling started for QR");
      await refetch();
    } catch (error) {
      console.error("Error refreshing QR code:", error);
      setQrError("Erro ao recriar instância. Verifique se o servidor Baileys está acessível.");
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

  const handleUpdateName = async (connectionId: string, name: string) => {
    try {
      await updateConnection.mutateAsync({ connectionId, name });
    } catch (error) {
      console.error("Error updating connection:", error);
    }
  };

  const handleUpdateColor = async (connectionId: string, color: string) => {
    try {
      await updateConnection.mutateAsync({ connectionId, color });
    } catch (error) {
      console.error("Error updating connection color:", error);
    }
  };

  const handleCreateMetaConnection = async () => {
    if (!metaName.trim() || !metaAccessToken.trim() || !metaPhoneNumberId.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o nome, Access Token e Phone Number ID.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingMeta(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .insert({
          name: metaName.trim(),
          type: "meta_api",
          status: "connected",
          session_data: {
            access_token: metaAccessToken.trim(),
            phone_number_id: metaPhoneNumberId.trim(),
            business_account_id: metaBusinessAccountId.trim() || null,
            webhook_verify_token: metaWebhookVerifyToken.trim() || null,
          },
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Conexão criada!",
        description: "Sua conexão com a API Oficial da Meta foi configurada com sucesso.",
      });

      setIsMetaDialogOpen(false);
      setMetaName("");
      setMetaAccessToken("");
      setMetaPhoneNumberId("");
      setMetaBusinessAccountId("");
      setMetaWebhookVerifyToken("");
      refetch();
    } catch (error) {
      console.error("Error creating Meta connection:", error);
      toast({
        title: "Erro ao criar conexão",
        description: "Não foi possível criar a conexão. Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingMeta(false);
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
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          
          {/* WhatsApp QR Code Dialog */}
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
                  Crie uma nova instância para conectar um número de WhatsApp via QR Code
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

          {/* Meta API Dialog */}
          <Dialog open={isMetaDialogOpen} onOpenChange={setIsMetaDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-blue-500 text-blue-500 hover:bg-blue-50">
                <Cloud className="w-4 h-4" />
                VIA META API
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-blue-500" />
                  Conexão via API Oficial da Meta
                </DialogTitle>
                <DialogDescription>
                  Configure sua conexão usando a API Cloud do WhatsApp Business
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="metaName">Nome da Conexão *</Label>
                  <Input
                    id="metaName"
                    placeholder="Ex: WhatsApp Oficial"
                    value={metaName}
                    onChange={(e) => setMetaName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaAccessToken">Access Token Permanente *</Label>
                  <Input
                    id="metaAccessToken"
                    type="password"
                    placeholder="EAAxxxxxx..."
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Gere um token permanente no Meta Business Suite
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaPhoneNumberId">Phone Number ID *</Label>
                  <Input
                    id="metaPhoneNumberId"
                    placeholder="123456789012345"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaBusinessAccountId">Business Account ID (opcional)</Label>
                  <Input
                    id="metaBusinessAccountId"
                    placeholder="123456789012345"
                    value={metaBusinessAccountId}
                    onChange={(e) => setMetaBusinessAccountId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaWebhookVerifyToken">Webhook Verify Token (opcional)</Label>
                  <Input
                    id="metaWebhookVerifyToken"
                    placeholder="Token para verificação do webhook"
                    value={metaWebhookVerifyToken}
                    onChange={(e) => setMetaWebhookVerifyToken(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsMetaDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateMetaConnection} 
                  disabled={!metaName.trim() || !metaAccessToken.trim() || !metaPhoneNumberId.trim() || isCreatingMeta}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {isCreatingMeta && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Conectar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Baileys Server Info */}
      <Card className="mb-2">
        <CardHeader className="pb-2 py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4" />
            Servidor Baileys
            {isLoadingServerInfo ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : serverInfo ? (
              <Badge variant={serverInfo.status === "online" ? "default" : "destructive"}>
                {serverInfo.status === "online" ? "Online" : "Offline"}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3">
          {serverInfo ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Versão:</span>
                <span className="ml-2 font-medium">{serverInfo.version || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Engine:</span>
                <span className="ml-2 font-medium">{serverInfo.engine || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sessões:</span>
                <span className="ml-2 font-medium">{serverInfo.sessionsCount ?? 0}</span>
              </div>
              <div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchServerInfo}
                  disabled={isLoadingServerInfo}
                  className="h-7 px-2"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingServerInfo ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Carregando informações do servidor...</span>
          )}
        </CardContent>
      </Card>

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
              onUpdateName={handleUpdateName}
              onUpdateColor={handleUpdateColor}
              isDisconnecting={disconnect.isPending}
              isRecreating={recreateConnection.isPending}
              isDeleting={deleteConnection.isPending}
              isUpdating={updateConnection.isPending}
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
                <div className="flex flex-col items-center gap-2 p-4 text-center">
                  <AlertTriangle className={`w-12 h-12 ${qrError.includes("API Key") ? "text-amber-500" : "text-destructive"}`} />
                  <span className="text-sm font-medium text-foreground">
                    {qrError.includes("API Key") ? "Erro de Autenticação" : "Erro ao gerar QR Code"}
                  </span>
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
