import {
  MessageSquare,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { TeamPerformance } from "@/components/dashboard/TeamPerformance";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonStatsCard } from "@/components/ui/SkeletonCard";

export default function Dashboard() {
  const { data: stats, isLoading, isError, error, refetch } = useDashboardStats();

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-destructive font-medium">Erro ao carregar dashboard</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error?.message}</p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Visão geral do seu atendimento"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStatsCard key={i} />)
        ) : (
          <>
            <StatsCard
              title="Conversas Ativas"
              value={stats?.activeConversations || 0}
              change={`${stats?.conversationsByStatus.new || 0} novas`}
              changeType="positive"
              icon={MessageSquare}
              iconColor="bg-primary/10 text-primary"
            />
            <StatsCard
              title="Contatos Totais"
              value={stats?.totalContacts?.toLocaleString() || "0"}
              change={`+${stats?.newContactsToday || 0} hoje`}
              changeType="positive"
              icon={Users}
              iconColor="bg-success/10 text-success"
            />
            <StatsCard
              title="Em Atendimento"
              value={stats?.conversationsByStatus.in_progress || 0}
              change="conversas em andamento"
              changeType="neutral"
              icon={Clock}
              iconColor="bg-warning/10 text-warning"
            />
            <StatsCard
              title="Resolvidas Hoje"
              value={stats?.resolvedToday || 0}
              change={`${stats?.conversationsByStatus.resolved || 0} total`}
              changeType="positive"
              icon={CheckCircle}
              iconColor="bg-info/10 text-info"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityChart />
        <TeamPerformance />
      </div>

      {/* Recent Conversations */}
      <RecentConversations />
    </div>
  );
}
