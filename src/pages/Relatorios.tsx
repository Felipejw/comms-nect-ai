import { useState } from "react";
import { Download, Filter, Calendar, TrendingUp, TrendingDown, Users, MessageSquare, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const barData = [
  { name: "Jan", conversas: 420, resolvidas: 380 },
  { name: "Fev", conversas: 580, resolvidas: 520 },
  { name: "Mar", conversas: 650, resolvidas: 600 },
  { name: "Abr", conversas: 720, resolvidas: 680 },
  { name: "Mai", conversas: 690, resolvidas: 650 },
  { name: "Jun", conversas: 850, resolvidas: 800 },
];

const pieData = [
  { name: "Suporte", value: 45, color: "hsl(221, 83%, 53%)" },
  { name: "Vendas", value: 30, color: "hsl(142, 76%, 36%)" },
  { name: "Financeiro", value: 15, color: "hsl(38, 92%, 50%)" },
  { name: "Outros", value: 10, color: "hsl(215, 16%, 47%)" },
];

const reportData = [
  { agent: "Carlos Eduardo", conversations: 245, resolved: 238, avgTime: "4.2 min", satisfaction: 98 },
  { agent: "Fernanda Souza", conversations: 198, resolved: 190, avgTime: "5.1 min", satisfaction: 96 },
  { agent: "Ricardo Lima", conversations: 312, resolved: 305, avgTime: "3.8 min", satisfaction: 99 },
  { agent: "Patricia Mendes", conversations: 167, resolved: 158, avgTime: "6.2 min", satisfaction: 94 },
  { agent: "Lucas Santos", conversations: 289, resolved: 280, avgTime: "4.5 min", satisfaction: 97 },
];

export default function Relatorios() {
  const [period, setPeriod] = useState("month");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Relatórios</h2>
          <p className="text-muted-foreground">Análise detalhada do desempenho</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
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
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total de Conversas"
          value="3.910"
          change="+18% vs período anterior"
          changeType="positive"
          icon={MessageSquare}
          iconColor="bg-primary/10 text-primary"
        />
        <StatsCard
          title="Taxa de Resolução"
          value="94.2%"
          change="+2.3% vs período anterior"
          changeType="positive"
          icon={CheckCircle}
          iconColor="bg-success/10 text-success"
        />
        <StatsCard
          title="Tempo Médio"
          value="4.6 min"
          change="-12% vs período anterior"
          changeType="positive"
          icon={Clock}
          iconColor="bg-warning/10 text-warning"
        />
        <StatsCard
          title="Novos Contatos"
          value="892"
          change="+24% vs período anterior"
          changeType="positive"
          icon={Users}
          iconColor="bg-info/10 text-info"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-lg mb-6">Evolução Mensal</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
                <XAxis dataKey="name" stroke="hsl(215, 16%, 47%)" fontSize={12} />
                <YAxis stroke="hsl(215, 16%, 47%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(214, 32%, 91%)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="conversas" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolvidas" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-lg mb-6">Por Categoria</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6">Desempenho por Atendente</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Atendente</TableHead>
              <TableHead className="text-right">Conversas</TableHead>
              <TableHead className="text-right">Resolvidas</TableHead>
              <TableHead className="text-right">Tempo Médio</TableHead>
              <TableHead className="text-right">Satisfação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.map((row) => (
              <TableRow key={row.agent}>
                <TableCell className="font-medium">{row.agent}</TableCell>
                <TableCell className="text-right">{row.conversations}</TableCell>
                <TableCell className="text-right">{row.resolved}</TableCell>
                <TableCell className="text-right">{row.avgTime}</TableCell>
                <TableCell className="text-right">
                  <Badge className={row.satisfaction >= 95 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
                    {row.satisfaction}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
