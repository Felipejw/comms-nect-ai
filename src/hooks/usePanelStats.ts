import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function usePanelStats() {
  const statsQuery = useQuery({
    queryKey: ["panel-stats"],
    queryFn: async () => {
      const [agentsRes, inProgressRes, inQueueRes, todayRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("is_online", true),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("status", "in_progress"),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("status", "new"),
        supabase
          .from("conversations")
          .select("created_at, updated_at")
          .eq("status", "in_progress"),
      ]);

      // Calculate average time for active conversations
      let totalTime = 0;
      let count = 0;
      const now = new Date();
      todayRes.data?.forEach((c) => {
        const start = new Date(c.created_at);
        const duration = now.getTime() - start.getTime();
        if (duration > 0) {
          totalTime += duration;
          count++;
        }
      });
      const avgTimeMinutes = count > 0 ? Math.round(totalTime / count / 60000) : 0;

      return {
        agentsOnline: agentsRes.count || 0,
        inProgress: inProgressRes.count || 0,
        inQueue: inQueueRes.count || 0,
        avgTimeMinutes,
      };
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return {
    stats: statsQuery.data,
    isLoading: statsQuery.isLoading,
    refetch: statsQuery.refetch,
  };
}

export function useActivityLog() {
  const activitiesQuery = useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      return data || [];
    },
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  return {
    activities: activitiesQuery.data || [],
    isLoading: activitiesQuery.isLoading,
  };
}

export function useRecentConversationsPanel() {
  const conversationsQuery = useQuery({
    queryKey: ["panel-recent-conversations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select(`
          id,
          status,
          created_at,
          updated_at,
          assigned_to,
          contact_id,
          contacts (name, phone)
        `)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (!data) return [];

      // Fetch profile names separately for assigned_to
      const assignedIds = [...new Set(data.filter(c => c.assigned_to).map(c => c.assigned_to))];
      let profilesMap: Record<string, string> = {};

      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", assignedIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = p.name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      return data.map(conv => ({
        ...conv,
        assignedName: conv.assigned_to ? profilesMap[conv.assigned_to] : null,
      }));
    },
    refetchInterval: 10000,
  });

  return {
    conversations: conversationsQuery.data || [],
    isLoading: conversationsQuery.isLoading,
  };
}
