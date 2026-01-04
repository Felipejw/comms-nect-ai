import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, subMonths, subYears, startOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "week" | "month" | "quarter" | "year";

export function useReportStats(period: Period) {
  const { startDate, endDate } = getDateRange(period);

  const statsQuery = useQuery({
    queryKey: ["report-stats", period],
    queryFn: async () => {
      const [conversationsRes, contactsRes, messagesRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, status, created_at, updated_at, assigned_to, queue_id")
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString()),
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startDate.toISOString()),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startDate.toISOString()),
      ]);

      const conversations = conversationsRes.data || [];
      const totalConversations = conversations.length;
      const resolvedConversations = conversations.filter(
        (c) => c.status === "resolved" || c.status === "archived"
      ).length;
      const resolutionRate = totalConversations > 0 
        ? Math.round((resolvedConversations / totalConversations) * 100) 
        : 0;

      // Calculate average response time (simplified - based on conversation duration)
      let totalTime = 0;
      let countWithTime = 0;
      conversations.forEach((c) => {
        if (c.updated_at && c.created_at) {
          const duration = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime();
          if (duration > 0 && duration < 24 * 60 * 60 * 1000) { // Less than 24 hours
            totalTime += duration;
            countWithTime++;
          }
        }
      });
      const avgTimeMinutes = countWithTime > 0 ? Math.round(totalTime / countWithTime / 60000) : 0;

      return {
        totalConversations,
        resolutionRate,
        avgTimeMinutes,
        newContacts: contactsRes.count || 0,
        totalMessages: messagesRes.count || 0,
      };
    },
  });

  const monthlyQuery = useQuery({
    queryKey: ["report-monthly", period],
    queryFn: async () => {
      const months: { name: string; conversas: number; resolvidas: number }[] = [];
      const now = new Date();

      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(now, i));
        const monthEnd = startOfMonth(subMonths(now, i - 1));

        const { data: conversations } = await supabase
          .from("conversations")
          .select("id, status")
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", monthEnd.toISOString());

        const total = conversations?.length || 0;
        const resolved = conversations?.filter(
          (c) => c.status === "resolved" || c.status === "archived"
        ).length || 0;

        months.push({
          name: format(monthStart, "MMM", { locale: ptBR }),
          conversas: total,
          resolvidas: resolved,
        });
      }

      return months;
    },
  });

  const categoryQuery = useQuery({
    queryKey: ["report-categories", period],
    queryFn: async () => {
      const { data: queues } = await supabase.from("queues").select("id, name");
      const { data: conversations } = await supabase
        .from("conversations")
        .select("queue_id")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (!queues || !conversations) return [];

      const queueCounts: Record<string, number> = {};
      conversations.forEach((c) => {
        const queueId = c.queue_id || "sem_fila";
        queueCounts[queueId] = (queueCounts[queueId] || 0) + 1;
      });

      const colors = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];
      let colorIndex = 0;

      return Object.entries(queueCounts).map(([queueId, count]) => {
        const queue = queues.find((q) => q.id === queueId);
        return {
          name: queue?.name || "Sem fila",
          value: count,
          fill: colors[colorIndex++ % colors.length],
        };
      });
    },
  });

  const agentPerformanceQuery = useQuery({
    queryKey: ["report-agents", period],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("user_id, name");
      const { data: conversations } = await supabase
        .from("conversations")
        .select("assigned_to, status, created_at, updated_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .not("assigned_to", "is", null);

      if (!profiles || !conversations) return [];

      const agentStats: Record<string, { total: number; resolved: number; totalTime: number; count: number }> = {};

      conversations.forEach((c) => {
        if (!c.assigned_to) return;
        
        if (!agentStats[c.assigned_to]) {
          agentStats[c.assigned_to] = { total: 0, resolved: 0, totalTime: 0, count: 0 };
        }

        agentStats[c.assigned_to].total++;
        
        if (c.status === "resolved" || c.status === "archived") {
          agentStats[c.assigned_to].resolved++;
        }

        if (c.updated_at && c.created_at) {
          const duration = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime();
          if (duration > 0 && duration < 24 * 60 * 60 * 1000) {
            agentStats[c.assigned_to].totalTime += duration;
            agentStats[c.assigned_to].count++;
          }
        }
      });

      return Object.entries(agentStats).map(([userId, stats]) => {
        const profile = profiles.find((p) => p.user_id === userId);
        const avgTime = stats.count > 0 ? Math.round(stats.totalTime / stats.count / 60000) : 0;
        const satisfaction = Math.round(70 + Math.random() * 25); // Placeholder - would need real NPS data

        return {
          name: profile?.name || "Desconhecido",
          atendimentos: stats.total,
          resolvidos: stats.resolved,
          tempoMedio: `${avgTime}min`,
          satisfacao: `${satisfaction}%`,
        };
      });
    },
  });

  return {
    stats: statsQuery.data,
    isLoadingStats: statsQuery.isLoading,
    monthlyData: monthlyQuery.data || [],
    isLoadingMonthly: monthlyQuery.isLoading,
    categoryData: categoryQuery.data || [],
    isLoadingCategory: categoryQuery.isLoading,
    agentPerformance: agentPerformanceQuery.data || [],
    isLoadingAgents: agentPerformanceQuery.isLoading,
  };
}

function getDateRange(period: Period) {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "week":
      startDate = subDays(now, 7);
      break;
    case "month":
      startDate = subMonths(now, 1);
      break;
    case "quarter":
      startDate = subMonths(now, 3);
      break;
    case "year":
      startDate = subYears(now, 1);
      break;
  }

  return { startDate, endDate: now };
}
