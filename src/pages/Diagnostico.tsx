import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Server,
  Database,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Clock,
  Zap,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InstanceHealth {
  url: string;
  priority: number;
  healthy: boolean;
  responseTime: number;
  version: string | null;
  activeSessions: number;
  assignedConnections: number;
  error: string | null;
}

interface HealthCheckResponse {
  success: boolean;
  configured?: boolean;
  message?: string;
  summary: {
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    overallStatus: "healthy" | "degraded" | "down" | "not_configured";
    totalConnections: number;
  };
  instances: InstanceHealth[];
  connectionsByInstance: Record<string, number>;
  timestamp: string;
}

interface ConnectionStatus {
  id: string;
  name: string;
  status: string;
  phone_number: string | null;
  session_data: {
    instanceUrl?: string;
  } | null;
}

export default function Diagnostico() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch WPPConnect health
  const {
    data: healthData,
    isLoading: isLoadingHealth,
    refetch: refetchHealth,
    error: healthError,
  } = useQuery({
    queryKey: ["wppconnect-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("wppconnect-instance", {
        body: { action: "health" },
      });
      if (error) throw error;
      return data as HealthCheckResponse;
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
      const { count, error } = await supabase
        .from("connections")
        .select("*", { count: "exact", head: true });
      const responseTime = Date.now() - startTime;
      return {
        healthy: !error,
        responseTime,
        error: error?.message || null,
      };
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
        .eq("type", "whatsapp")
        .order("name");
      if (error) throw error;
      return data as ConnectionStatus[];
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  useEffect(() => {
    if (healthData || dbStatus || connections) {
      setLastRefresh(new Date());
    }
  }, [healthData, dbStatus, connections]);

  const handleRefresh = () => {
    refetchHealth();
    refetchDb();
    refetchConnections();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "connected":
        return "text-green-500";
      case "degraded":
      case "connecting":
        return "text-yellow-500";
      case "down":
      case "disconnected":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
      case "connected":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>;
      case "degraded":
      case "connecting":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Degradado</Badge>;
      case "down":
      case "disconnected":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Offline</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const getOverallStatusIcon = () => {
    if (!healthData) return <Activity className="w-8 h-8 text-muted-foreground" />;
    switch (healthData.summary.overallStatus) {
      case "healthy":
        return <CheckCircle2 className="w-8 h-8 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="w-8 h-8 text-yellow-500" />;
      case "down":
        return <XCircle className="w-8 h-8 text-red-500" />;
      case "not_configured":
        return <AlertTriangle className="w-8 h-8 text-muted-foreground" />;
    }
  };

  const connectedCount = connections?.filter((c) => c.status === "connected").length || 0;
  const totalConnections = connections?.length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Diagnóstico do Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento em tempo real de todas as instâncias e conexões
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
                <p className={cn("text-2xl font-bold capitalize", getStatusColor(healthData?.summary.overallStatus || ""))}>
                  {isLoadingHealth ? (
                    <Skeleton className="h-8 w-24" />
                  ) : healthData?.summary.overallStatus === "healthy" ? (
                    "Saudável"
                  ) : healthData?.summary.overallStatus === "degraded" ? (
                    "Degradado"
                  ) : healthData?.summary.overallStatus === "not_configured" ? (
                    "Não Configurado"
                  ) : (
                    "Offline"
                  )}
                </p>
              </div>
              {getOverallStatusIcon()}
            </div>
          </CardContent>
        </Card>

        {/* WPPConnect Instances */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Instâncias WPPConnect</p>
                {isLoadingHealth ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold">
                    <span className="text-green-500">{healthData?.summary.healthyInstances || 0}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span>{healthData?.summary.totalInstances || 0}</span>
                  </p>
                )}
              </div>
              <Server className="w-8 h-8 text-muted-foreground" />
            </div>
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

      {/* WPPConnect Instances Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Instâncias WPPConnect
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingHealth ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : healthError ? (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p>Erro ao carregar status das instâncias</p>
              <p className="text-sm">{(healthError as Error).message}</p>
            </div>
          ) : healthData?.configured === false || healthData?.instances.length === 0 ? (
            <div className="text-center py-8">
              <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Nenhuma instância WPPConnect configurada</p>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Para começar a usar o WPPConnect, configure a variável de ambiente{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">WPPCONNECT_API_URL</code>{" "}
                com a URL do seu servidor WPPConnect e{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">WPPCONNECT_SECRET_KEY</code>{" "}
                com a chave secreta.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {healthData?.instances.map((instance, index) => (
                <div
                  key={instance.url}
                  className={cn(
                    "p-4 rounded-lg border",
                    instance.healthy ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "w-3 h-3 rounded-full",
                          instance.healthy ? "bg-green-500 animate-pulse" : "bg-red-500"
                        )}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Instância #{index + 1}</span>
                          {instance.priority === 0 && (
                            <Badge variant="outline" className="text-xs">Load Balancer</Badge>
                          )}
                          {instance.priority === 1 && (
                            <Badge variant="outline" className="text-xs">Primária</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">{instance.url}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {instance.responseTime}ms
                        </span>
                      </div>

                      {instance.version && (
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{instance.version}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{instance.activeSessions} sessões</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{instance.assignedConnections} conexões</span>
                      </div>

                      {getStatusBadge(instance.healthy ? "healthy" : "down")}
                    </div>
                  </div>

                  {instance.error && (
                    <div className="mt-3 p-2 bg-red-500/10 rounded text-sm text-red-500">
                      Erro: {instance.error}
                    </div>
                  )}
                </div>
              ))}
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
                  {conn.session_data?.instanceUrl && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono truncate">
                      {conn.session_data.instanceUrl}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
