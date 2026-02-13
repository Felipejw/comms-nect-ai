import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useTeamPerformance } from "@/hooks/useDashboardStats";
import { SkeletonTeamPerformance } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";

export function TeamPerformance() {
  const { data: teamData, isLoading } = useTeamPerformance();

  if (isLoading) return <SkeletonTeamPerformance />;

  // Calculate max for percentage
  const maxTotal = Math.max(...(teamData?.map(m => m.resolved + m.active) || [1]), 1);

  return (
    <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
      <h3 className="font-semibold text-lg mb-6">Desempenho da Equipe</h3>
      
      {!teamData || teamData.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum dado de equipe"
          description="Os dados de desempenho aparecerão quando atendentes forem atribuídos a conversas."
        />
      ) : (
        <div className="space-y-6">
          {teamData.slice(0, 5).map((member) => {
            const total = member.resolved + member.active;
            const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
            
            return (
              <div key={member.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {member.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="font-medium text-sm">{member.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm">
                      <span className="text-success">{member.resolved}</span>/{total}
                    </p>
                    <p className="text-xs text-muted-foreground">atendimentos</p>
                  </div>
                </div>
                <Progress value={percentage} className="h-2" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
