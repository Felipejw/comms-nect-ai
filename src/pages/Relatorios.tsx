import { useState } from "react";
import { Download, Calendar, Users, MessageSquare, Clock, CheckCircle, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useReportStats } from "@/hooks/useReportStats";

type Period = "week" | "month" | "quarter" | "year";

export default function Relatorios() {
  const [period, setPeriod] = useState<Period>("month");
  const { 
    stats, 
    isLoadingStats, 
    monthlyData, 
    isLoadingMonthly,
    categoryData,
    isLoadingCategory,
    agentPerformance,
    isLoadingAgents,
    hasError,
    errorMessage,
    refetchAll,
  } = useReportStats(period);

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Relatórios</h2>
          <p className="text-muted-foreground">Análise detalhada do desempenho</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Esta Semana</SelectItem>
              <SelectItem value="month">Este Mês</SelectItem>
              <SelectItem value="quarter">Este Trimestre</SelectItem>
              <SelectItem value="year">Este Ano</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => {
            if (!stats && agentPerformance.length === 0) {
              return;
            }
            const csvRows = [
              ["Atendente", "Atendimentos", "Resolvidos", "Tempo Médio", "Taxa Resolução"],
              ...agentPerformance.map(a => [a.name, String(a.atendimentos), String(a.resolvidos), a.tempoMedio, a.taxaResolucao]),
            ];
            const csvContent = csvRows.map(r => r.join(",")).join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `relatorio-${period}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </div>
      </div>

      {hasError && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 bg-card rounded-xl border border-destructive/50">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="font-medium">Erro ao carregar relatórios</p>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoadingStats ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="Total de Conversas"
              value={stats?.totalConversations?.toLocaleString() || "0"}
              change="vs período anterior"
              changeType="neutral"
              icon={MessageSquare}
              iconColor="bg-primary/10 text-primary"
            />
            <StatsCard
              title="Taxa de Resolução"
              value={`${stats?.resolutionRate || 0}%`}
              change="vs período anterior"
              changeType={stats?.resolutionRate && stats.resolutionRate > 80 ? "positive" : "negative"}
              icon={CheckCircle}
              iconColor="bg-success/10 text-success"
            />
            <StatsCard
              title="Tempo Médio"
              value={formatTime(stats?.avgTimeMinutes || 0)}
              change="vs período anterior"
              changeType="neutral"
              icon={Clock}
              iconColor="bg-warning/10 text-warning"
            />
            <StatsCard
              title="Novos Contatos"
              value={stats?.newContacts?.toLocaleString() || "0"}
              change="vs período anterior"
              changeType="positive"
              icon={Users}
              iconColor="bg-info/10 text-info"
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-lg mb-6">Evolução Mensal</h3>
          <div className="h-72">
            {isLoadingMonthly ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : monthlyData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="conversas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Conversas" />
                  <Bar dataKey="resolvidas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Resolvidas" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-lg mb-6">Por Categoria</h3>
          <div className="h-72">
            {isLoadingCategory ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : categoryData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {categoryData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                <span className="text-sm text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6">Desempenho por Atendente</h3>
        {isLoadingAgents ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : agentPerformance.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum dado de atendente disponível para este período
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Atendente</TableHead>
                <TableHead className="text-right">Atendimentos</TableHead>
                <TableHead className="text-right">Resolvidos</TableHead>
                <TableHead className="text-right">Tempo Médio</TableHead>
                <TableHead className="text-right">Taxa Resolução</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentPerformance.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.atendimentos}</TableCell>
                  <TableCell className="text-right">{row.resolvidos}</TableCell>
                  <TableCell className="text-right">{row.tempoMedio}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={parseInt(row.taxaResolucao) >= 80 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
                      {row.taxaResolucao}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
