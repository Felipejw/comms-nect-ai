import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, Server, Database, Wifi, WifiOff, CheckCircle2, XCircle,
  AlertTriangle, Activity, Clock, Users, FileText, ChevronLeft, ChevronRight,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, subHours } from "date-fns";
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

const ACTION_LABELS: Record<string, string> = {
  create: "Criou",
  update: "Atualizou",
  delete: "Excluiu",
  login: "Login",
  logout: "Logout",
  send_message: "Enviou mensagem",
  receive_message: "Recebeu mensagem",
  execute_campaign: "Executou campanha",
  execute_flow: "Executou fluxo",
  reset_password: "Redefiniu senha",
  assign: "Atribuiu",
  transfer: "Transferiu",
  archive: "Arquivou",
  resolve: "Resolveu",
};

const ENTITY_LABELS: Record<string, string> = {
  contact: "Contato",
  conversation: "Conversa",
  message: "Mensagem",
  user: "Usuário",
  campaign: "Campanha",
  connection: "Conexão",
  tag: "Tag",
  queue: "Fila",
  quick_reply: "Resposta rápida",
  chatbot_rule: "Regra chatbot",
  chatbot_flow: "Fluxo chatbot",
  session: "Sessão",
  system_settings: "Configuração",
  schedule: "Agendamento",
  messages: "Mensagem",
  schedules: "Agendamento",
};

const PERIOD_OPTIONS = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

const PAGE_SIZE = 50;

export default function Diagnostico() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Activity log filters
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("7d");
  const [attendantFilter, setAttendantFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(0); }, [actionFilter, entityFilter, periodFilter, attendantFilter]);

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

  // Compute period date
  const getPeriodDate = () => {
    const now = new Date();
    switch (periodFilter) {
      case "24h": return subHours(now, 24);
      case "7d": return subDays(now, 7);
      case "30d": return subDays(now, 30);
      default: return subDays(now, 7);
    }
  };

  // Fetch all profiles for attendant filter
  const { data: allProfiles } = useQuery({
    queryKey: ["profiles-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, avatar_url")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch activity logs with filters and pagination
  const {
    data: activityLogsData,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["activity-logs-diagnostic", actionFilter, entityFilter, periodFilter, attendantFilter, currentPage],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("id, action, entity_type, entity_id, metadata, created_at, user_id, ip_address", { count: "exact" })
        .gte("created_at", getPeriodDate().toISOString())
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }
      if (entityFilter !== "all") {
        query = query.eq("entity_type", entityFilter);
      }
      if (attendantFilter !== "all") {
        if (attendantFilter === "system") {
          query = query.is("user_id", null);
        } else {
          query = query.eq("user_id", attendantFilter);
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const userIds = [...new Set(data?.map(log => log.user_id).filter(Boolean))];
      let profileMap: Record<string, { name: string; avatar_url: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", userIds);
        profiles?.forEach(p => { profileMap[p.user_id] = { name: p.name, avatar_url: p.avatar_url }; });
      }

      const logs = data?.map(log => ({
        ...log,
        userName: log.user_id ? (profileMap[log.user_id]?.name || "Usuário desconhecido") : "Sistema",
        userAvatar: log.user_id ? (profileMap[log.user_id]?.avatar_url || null) : null,
      })) || [];

      return { logs, totalCount: count || 0 };
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const activityLogs = activityLogsData?.logs || [];
  const totalCount = activityLogsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    if (healthData || dbStatus || connections || activityLogsData) {
      setLastRefresh(new Date());
    }
  }, [healthData, dbStatus, connections, activityLogsData]);

  const handleRefresh = () => {
    refetchHealth();
    refetchDb();
    refetchConnections();
    refetchLogs();
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

  const getMetadataSummary = (metadata: unknown): string => {
    if (!metadata || typeof metadata !== 'object') return '';
    const meta = metadata as Record<string, unknown>;
    const parts: string[] = [];
    if (meta.name) parts.push(String(meta.name));
    if (meta.contact_name) parts.push(String(meta.contact_name));
    if (meta.email) parts.push(String(meta.email));
    if (meta.campaign_name) parts.push(String(meta.campaign_name));
    if (meta.old_status && meta.new_status) parts.push(`${meta.old_status} → ${meta.new_status}`);
    if (meta.sent !== undefined) parts.push(`${meta.sent} enviadas`);
    if (meta.failed !== undefined && Number(meta.failed) > 0) parts.push(`${meta.failed} falhas`);
    return parts.join(' · ');
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

  // Collect unique action and entity values for filter dropdowns
  const actionOptions = Object.keys(ACTION_LABELS);
  const entityOptions = Object.keys(ENTITY_LABELS);

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

        {/* Activity Count */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Atividades Recentes</p>
                {isLoadingLogs ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{totalCount}</p>
                )}
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label || "Últimos 7 dias"}
            </p>
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
            <Skeleton className="h-20 w-full" />
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
            <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/5">
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Log de Atividades
              {totalCount > 0 && (
                <Badge variant="secondary" className="ml-2">{totalCount}</Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {actionOptions.map(key => (
                    <SelectItem key={key} value={key}>{ACTION_LABELS[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as entidades</SelectItem>
                  {entityOptions.map(key => (
                    <SelectItem key={key} value={key}>{ENTITY_LABELS[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={attendantFilter} onValueChange={setAttendantFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Atendente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os atendentes</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                  {allProfiles?.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4" />
              <p>Nenhuma atividade registrada{actionFilter !== "all" || entityFilter !== "all" ? " com os filtros selecionados" : ""}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Data/Hora</TableHead>
                      <TableHead className="w-[180px]">Atendente</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>Detalhes</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityLogs.map((log) => {
                      const errorInfo = hasError(log.metadata);
                      const summary = getMetadataSummary(log.metadata);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">
                            <div className="flex flex-col">
                              <span>{format(new Date(log.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                              <span className="text-muted-foreground">{format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.user_id ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={log.userAvatar || undefined} />
                                  <AvatarFallback className="text-[10px]">
                                    {log.userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-sm">{log.userName}</span>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Sistema</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ACTION_LABELS[log.action] || log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{ENTITY_LABELS[log.entity_type] || log.entity_type}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground max-w-[250px] truncate block">
                              {errorInfo.hasError ? errorInfo.errorMessage : summary}
                            </span>
                          </TableCell>
                          <TableCell>
                            {errorInfo.hasError ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Página {currentPage + 1} de {totalPages} · {totalCount} registros
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
