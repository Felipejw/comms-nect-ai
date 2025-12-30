import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { useTeamPerformance } from "@/hooks/useDashboardStats";

export function TeamPerformance() {
  const { data: teamData, isLoading } = useTeamPerformance();

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
        <h3 className="font-semibold text-lg mb-6">Desempenho da Equipe</h3>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Calculate max for percentage
  const maxTotal = Math.max(...(teamData?.map(m => m.resolved + m.active) || [1]), 1);

  return (
    <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
      <h3 className="font-semibold text-lg mb-6">Desempenho da Equipe</h3>
      
      {!teamData || teamData.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Nenhum dado de equipe disponível
        </div>
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
