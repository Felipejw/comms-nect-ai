import { useCampaignMetrics } from "@/hooks/useCampaignMetrics";
import { 
  Send, 
  CheckCircle2, 
  Eye, 
  XCircle, 
  TrendingUp, 
  Clock, 
  Zap,
  BarChart3,
  Loader2,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ['hsl(var(--muted))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--primary))'];

const statusConfig = {
  draft: { label: "Rascunho", color: "bg-muted" },
  active: { label: "Ativa", color: "bg-success" },
  paused: { label: "Pausada", color: "bg-warning" },
  completed: { label: "Concluída", color: "bg-primary" },
};

export function CampaignMetricsDashboard() {
  const { data: metrics, isLoading, refetch, isFetching } = useCampaignMetrics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium mb-2">Sem dados disponíveis</h3>
        <p className="text-muted-foreground">Crie campanhas para visualizar métricas</p>
      </div>
    );
  }

  const pieData = [
    { name: 'Rascunho', value: metrics.campaignsByStatus.draft },
    { name: 'Ativa', value: metrics.campaignsByStatus.active },
    { name: 'Pausada', value: metrics.campaignsByStatus.paused },
    { name: 'Concluída', value: metrics.campaignsByStatus.completed },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Dashboard de Métricas</h3>
          <p className="text-sm text-muted-foreground">
            Atualizado em tempo real
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Enviadas"
          value={metrics.totalSent}
          icon={Send}
          trend={metrics.totalSent > 0 ? "+12%" : undefined}
          trendUp={true}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <MetricCard
          title="Entregues"
          value={metrics.totalDelivered}
          icon={CheckCircle2}
          trend={`${metrics.deliveryRate}%`}
          trendUp={metrics.deliveryRate >= 90}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <MetricCard
          title="Lidas"
          value={metrics.totalRead}
          icon={Eye}
          trend={`${metrics.readRate}%`}
          trendUp={metrics.readRate >= 50}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />
        <MetricCard
          title="Falhas"
          value={metrics.totalFailed}
          icon={XCircle}
          trend={metrics.totalSent > 0 ? `${Math.round((metrics.totalFailed / metrics.totalSent) * 100)}%` : "0%"}
          trendUp={false}
          color="text-red-500"
          bgColor="bg-red-500/10"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Atividade nas Últimas 24h
            </CardTitle>
            <CardDescription>Mensagens enviadas, entregues e lidas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.hourlyStats}>
                  <defs>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sent" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorSent)" 
                    name="Enviadas"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="delivered" 
                    stroke="hsl(142, 76%, 36%)" 
                    fillOpacity={1} 
                    fill="url(#colorDelivered)"
                    name="Entregues" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="read" 
                    stroke="hsl(262, 83%, 58%)" 
                    fillOpacity={1} 
                    fill="url(#colorRead)"
                    name="Lidas" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Status das Campanhas
            </CardTitle>
            <CardDescription>{metrics.totalCampaigns} campanhas no total</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                  {Object.entries(metrics.campaignsByStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-full", statusConfig[status as keyof typeof statusConfig].color)} />
                        <span>{statusConfig[status as keyof typeof statusConfig].label}</span>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma campanha criada
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Delivery Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taxa de Entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-green-500">{metrics.deliveryRate}%</span>
              <Badge variant={metrics.deliveryRate >= 90 ? "default" : "secondary"} className={metrics.deliveryRate >= 90 ? "bg-green-500" : ""}>
                {metrics.deliveryRate >= 90 ? "Excelente" : metrics.deliveryRate >= 70 ? "Bom" : "Precisa melhorar"}
              </Badge>
            </div>
            <Progress value={metrics.deliveryRate} className="h-3" />
            <p className="text-sm text-muted-foreground">
              {metrics.totalDelivered.toLocaleString()} de {metrics.totalSent.toLocaleString()} mensagens entregues
            </p>
          </CardContent>
        </Card>

        {/* Read Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taxa de Leitura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-purple-500">{metrics.readRate}%</span>
              <Badge variant={metrics.readRate >= 50 ? "default" : "secondary"} className={metrics.readRate >= 50 ? "bg-purple-500" : ""}>
                {metrics.readRate >= 50 ? "Excelente" : metrics.readRate >= 30 ? "Bom" : "Precisa melhorar"}
              </Badge>
            </div>
            <Progress value={metrics.readRate} className="h-3" />
            <p className="text-sm text-muted-foreground">
              {metrics.totalRead.toLocaleString()} de {metrics.totalDelivered.toLocaleString()} mensagens lidas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns */}
      {metrics.recentCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Campanhas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.recentCampaigns.map((campaign) => (
                <div 
                  key={campaign.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", statusConfig[campaign.status].color)} />
                    <div>
                      <p className="font-medium text-sm">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(campaign.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <p className="font-medium">{(campaign.sent_count || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Enviadas</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-500">{(campaign.delivered_count || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Entregues</p>
                    </div>
                    <Badge className={statusConfig[campaign.status].color}>
                      {statusConfig[campaign.status].label}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
  color: string;
  bgColor: string;
}

function MetricCard({ title, value, icon: Icon, trend, trendUp, color, bgColor }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", bgColor)}>
            <Icon className={cn("w-5 h-5", color)} />
          </div>
          {trend && (
            <Badge 
              variant="secondary" 
              className={cn(
                "text-xs",
                trendUp ? "text-green-600 bg-green-100" : "text-red-600 bg-red-100"
              )}
            >
              {trend}
            </Badge>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}