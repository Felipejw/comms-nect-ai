import { useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SkeletonChart } from "@/components/ui/SkeletonCard";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function useWeeklyActivity() {
  return useQuery({
    queryKey: ["weekly-activity"],
    queryFn: async () => {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      weekAgo.setHours(0, 0, 0, 0);

      const { data: conversations } = await supabase
        .from("conversations")
        .select("created_at, status")
        .gte("created_at", weekAgo.toISOString());

      const buckets: Record<string, { conversas: number; resolvidas: number }> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekAgo);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = { conversas: 0, resolvidas: 0 };
      }

      conversations?.forEach((c) => {
        const key = c.created_at.slice(0, 10);
        if (buckets[key]) {
          buckets[key].conversas++;
          if (c.status === "resolved") buckets[key].resolvidas++;
        }
      });

      return Object.entries(buckets).map(([date, vals]) => ({
        name: DAY_LABELS[new Date(date + "T12:00:00").getDay()],
        ...vals,
      }));
    },
    refetchInterval: 60000,
  });
}

export function ActivityChart() {
  const { data, isLoading } = useWeeklyActivity();

  const cssVars = useMemo(() => {
    if (typeof window === "undefined") return { primary: "#3b82f6", success: "#22c55e", border: "#e5e7eb", card: "#fff", muted: "#6b7280" };
    const style = getComputedStyle(document.documentElement);
    return {
      primary: `hsl(${style.getPropertyValue("--primary").trim()})`,
      success: `hsl(${style.getPropertyValue("--success").trim()})`,
      border: `hsl(${style.getPropertyValue("--border").trim()})`,
      card: `hsl(${style.getPropertyValue("--card").trim()})`,
      muted: `hsl(${style.getPropertyValue("--muted-foreground").trim()})`,
    };
  }, []);

  if (isLoading) return <SkeletonChart />;

  return (
    <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-lg">Atividade Semanal</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-muted-foreground">Conversas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span className="text-muted-foreground">Resolvidas</span>
          </div>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorConversas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cssVars.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={cssVars.primary} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorResolvidas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cssVars.success} stopOpacity={0.3} />
                <stop offset="95%" stopColor={cssVars.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={cssVars.border} />
            <XAxis dataKey="name" stroke={cssVars.muted} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={cssVars.muted} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: cssVars.card,
                border: `1px solid ${cssVars.border}`,
                borderRadius: "8px",
              }}
            />
            <Area type="monotone" dataKey="conversas" stroke={cssVars.primary} fillOpacity={1} fill="url(#colorConversas)" strokeWidth={2} />
            <Area type="monotone" dataKey="resolvidas" stroke={cssVars.success} fillOpacity={1} fill="url(#colorResolvidas)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
