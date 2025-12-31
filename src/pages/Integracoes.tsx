import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export default function Integracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Plug className="w-7 h-7" />
          Integrações
        </h2>
        <p className="text-muted-foreground">Conecte serviços externos ao sistema</p>
      </div>

      {/* Future Integrations */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Plug className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Integrações em Breve</h3>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            Em breve você poderá conectar serviços externos para expandir as funcionalidades do sistema.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["CRM", "E-mail Marketing", "ERP", "Pagamentos", "Analytics"].map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
