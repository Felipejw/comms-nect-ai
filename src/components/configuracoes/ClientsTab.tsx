import { Users } from "lucide-react";

export function ClientsTab() {
  return (
    <div className="bg-card rounded-lg p-6">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Configurações de Clientes</h3>
        <p className="text-muted-foreground max-w-md">
          Gerencie as configurações relacionadas aos seus clientes, como campos
          personalizados, regras de importação e exportação de dados.
        </p>
      </div>
    </div>
  );
}
