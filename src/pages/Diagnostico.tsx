import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  RefreshCw, Server, Database, Wifi, WifiOff, CheckCircle2, XCircle,
  AlertTriangle, Activity, Clock, Users, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BaileysHealthResponse {
  success: boolean;
  data?: {
    status: string;
    version?: string;
    sessions?: number;
    uptime?: number;
  };
  error?: string;
}

interface ConnectionStatus {
  id: string;
  name: string;
  status: string;
  phone_number: string | null;
  session_data: Record<string, unknown> | null;
}

export default function Diagnostico() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch Baileys server health
  const {
    data: healthData,
    isLoading: isLoadingHealth,
    refetch: refetchHealth,
    error: healthError,
  } = useQuery({
    queryKey: ["baileys-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("baileys-instance", {
        body: { action: "serverHealth" },
      });
      if (error) throw error;
      return data as BaileysHealthResponse;
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch database status
  const {
    data: dbStatus,
    isLoading: isLoadingDb,
    refetch: refetchDb,
  } = useQuery({
    queryKey: ["db-health"],
    queryFn: async () => {
      const startTime = Date.now();
      const { error } = await supabase
        .from("connections")
        .select("*", { count: "exact", head: true });
      const responseTime = Date.now() - startTime;
      return { healthy: !error, responseTime, error: error?.message || null };
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch WhatsApp connections
  const {
    data: connections,
    isLoading: isLoadingConnections,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: ["connections-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connections")
        .select("id, name, status, phone_number, session_data")
        .in("type", ["whatsapp", "meta_api"])
        .order("name");
      if (error) throw error;
      return data as ConnectionStatus[];
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch activity logs
  const {
    data: activityLogs,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["activity-logs-diagnostic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, action, entity_type, entity_id, metadata, created_at, user_id, ip_address")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      const userIds = [...new Set(data?.map(log => log.user_id).filter(Boolean))];
      let userNames: Record<string, string> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", userIds);
        
        profiles?.forEach(p => { userNames[p.user_id] = p.name; });
      }
      
      return data?.map(log => ({
        ...log,
        userName: log.user_id ? (userNames[log.user_id] || "Usuário desconhecido") : "Sistema",
      })) || [];
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  useEffect(() => {
    if (healthData || dbStatus || connections || activityLogs) {
      setLastRefresh(new Date());
    }
  }, [healthData, dbStatus, connections, activityLogs]);

  const handleRefresh = () => {
    refetchHealth();
    refetchDb();
    refetchConnections();
    refetchLogs();
  };

  const getActionLabel = (action: string) => {
    const actionMap: Record<string, string> = {
      create: "Criou", update: "Atualizou", delete: "Excluiu",
      login: "Login", logout: "Logout",
      send_message: "Enviou mensagem", receive_message: "Recebeu mensagem",
    };
    return actionMap[action] || action;
  };

  const getEntityLabel = (entityType: string) => {
    const entityMap: Record<string, string> = {
      conversation: "Conversa", contact: "Contato", message: "Mensagem",
      user: "Usuário", campaign: "Campanha", connection: "Conexão",
      tag: "Tag", queue: "Fila",
    };
    return entityMap[entityType] || entityType;
  };

  const hasError = (metadata: unknown): { hasError: boolean; errorMessage: string | null } => {
    if (!metadata || typeof metadata !== 'object') return { hasError: false, errorMessage: null };
    const meta = metadata as Record<string, unknown>;
    if (meta.error) return { hasError: true, errorMessage: String(meta.error) };
    if (meta.status === 'error') return { hasError: true, errorMessage: meta.message ? String(meta.message) : 'Erro desconhecido' };
    return { hasError: false, errorMessage: null };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>;
      case "connecting":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Conectando</Badge>;
      case "disconnected":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Offline</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const baileysOnline = healthData?.data?.status === "ok";
  const connectedCount = connections?.filter((c) => c.status === "connected").length || 0;
  const totalConnections = connections?.length || 0;

  const overallStatus = (() => {
    if (isLoadingHealth || isLoadingDb) return "loading";
    if (!baileysOnline && !dbStatus?.healthy) return "down";
    if (!baileysOnline || !dbStatus?.healthy) return "degraded";
    return "healthy";
  })();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Diagnóstico do Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento em tempo real dos serviços e conexões
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            Última atualização: {lastRefresh.toLocaleTimeString("pt-BR")}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(autoRefresh && "border-primary text-primary")}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", autoRefresh && "animate-spin")} />
            {autoRefresh ? "Auto" : "Manual"}
          </Button>
          <Button onClick={handleRefresh} size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Overall Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status Geral</p>
                <p className={cn("text-2xl font-bold capitalize",
                  overallStatus === "healthy" ? "text-green-500" :
                  overallStatus === "degraded" ? "text-yellow-500" :
                  overallStatus === "down" ? "text-red-500" : "text-muted-foreground"
                )}>
                  {overallStatus === "loading" ? (
                    <Skeleton className="h-8 w-24" />
                  ) : overallStatus === "healthy" ? "Saudável" :
                    overallStatus === "degraded" ? "Degradado" : "Offline"}
                </p>
              </div>
              {overallStatus === "healthy" ? (
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              ) : overallStatus === "degraded" ? (
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
              ) : overallStatus === "down" ? (
                <XCircle className="w-8 h-8 text-red-500" />
              ) : (
                <Activity className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Baileys Server */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Servidor Baileys</p>
                {isLoadingHealth ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className={cn("text-2xl font-bold", baileysOnline ? "text-green-500" : "text-red-500")}>
                    {baileysOnline ? "Online" : "Offline"}
                  </p>
                )}
              </div>
              <Server className={cn("w-8 h-8", baileysOnline ? "text-green-500" : "text-red-500")} />
            </div>
            {healthData?.data && (
              <div className="mt-2 space-y-1">
                {healthData.data.version && (
                  <p className="text-xs text-muted-foreground">Versão: {healthData.data.version}</p>
                )}
                {healthData.data.sessions !== undefined && (
                  <p className="text-xs text-muted-foreground">Sessões: {healthData.data.sessions}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Banco de Dados</p>
                {isLoadingDb ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <p className={cn("text-2xl font-bold", dbStatus?.healthy ? "text-green-500" : "text-red-500")}>
                    {dbStatus?.healthy ? "Online" : "Offline"}
                  </p>
                )}
              </div>
              <Database className={cn("w-8 h-8", dbStatus?.healthy ? "text-green-500" : "text-red-500")} />
            </div>
            {dbStatus && (
              <p className="text-xs text-muted-foreground mt-2">
                Latência: {dbStatus.responseTime}ms
              </p>
            )}
          </CardContent>
        </Card>

        {/* WhatsApp Connections */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conexões WhatsApp</p>
                {isLoadingConnections ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold">
                    <span className="text-green-500">{connectedCount}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span>{totalConnections}</span>
                  </p>
                )}
              </div>
              {connectedCount === totalConnections && totalConnections > 0 ? (
                <Wifi className="w-8 h-8 text-green-500" />
              ) : (
                <WifiOff className="w-8 h-8 text-yellow-500" />
              )}
            </div>
            {totalConnections > 0 && (
              <Progress value={(connectedCount / totalConnections) * 100} className="mt-3 h-2" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Baileys Server Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Servidor Baileys
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingHealth ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : healthError ? (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p className="font-medium">Erro ao verificar servidor Baileys</p>
              <p className="text-sm mt-1">{(healthError as Error).message}</p>
              <p className="text-sm mt-3">
                Verifique se a URL e API Key do servidor Baileys estão configuradas corretamente em{" "}
                <span className="font-medium">Configurações &gt; Opções &gt; Servidor WhatsApp</span>.
              </p>
            </div>
          ) : !baileysOnline ? (
            <div className="text-center py-8">
              <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Servidor Baileys não acessível</p>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                O servidor Baileys não está respondendo. Verifique se ele está rodando e se a URL está correta em{" "}
                <span className="font-medium">Configurações &gt; Opções &gt; Servidor WhatsApp</span>.
              </p>
            </div>
          ) : (
            <div className={cn("p-4 rounded-lg border border-green-500/20 bg-green-500/5")}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <span className="font-medium">Baileys WhatsApp Server</span>
                    <p className="text-sm text-muted-foreground">Engine: Baileys</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                  {healthData?.data?.version && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{healthData.data.version}</span>
                    </div>
                  )}
                  {healthData?.data?.sessions !== undefined && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{healthData.data.sessions} sessões</span>
                    </div>
                  )}
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp Connections Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Conexões WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingConnections ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : connections?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wifi className="w-12 h-12 mx-auto mb-4" />
              <p>Nenhuma conexão WhatsApp configurada</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections?.map((conn) => (
                <div
                  key={conn.id}
                  className={cn(
                    "p-4 rounded-lg border",
                    conn.status === "connected"
                      ? "border-green-500/20 bg-green-500/5"
                      : conn.status === "connecting"
                      ? "border-yellow-500/20 bg-yellow-500/5"
                      : "border-border bg-muted/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{conn.name}</p>
                      {conn.phone_number && (
                        <p className="text-sm text-muted-foreground">{conn.phone_number}</p>
                      )}
                    </div>
                    {getStatusBadge(conn.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Log de Atividades
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !activityLogs || activityLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4" />
              <p>Nenhuma atividade registrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.map((log) => {
                    const errorInfo = hasError(log.metadata);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{log.userName}</span>
                            {log.ip_address && (
                              <span className="text-xs text-muted-foreground">{log.ip_address}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getActionLabel(log.action)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{getEntityLabel(log.entity_type)}</span>
                            {log.entity_id && (
                              <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                                {log.entity_id}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {errorInfo.hasError ? (
                            <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                              <XCircle className="w-3 h-3 mr-1" />
                              Erro
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              OK
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {errorInfo.hasError && errorInfo.errorMessage && (
                            <span className="text-sm text-red-500 max-w-[200px] truncate block">
                              {errorInfo.errorMessage}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
