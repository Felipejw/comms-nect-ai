import { CreditCard } from "lucide-react";

export function PlansTab() {
  return (
    <div className="bg-card rounded-lg p-6">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <CreditCard className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Planos e Assinaturas</h3>
        <p className="text-muted-foreground max-w-md">
          Visualize e gerencie seu plano atual, histórico de pagamentos e opções
          de upgrade para recursos adicionais.
        </p>
      </div>
    </div>
  );
}
