import { ShieldX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function AcessoNegado() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldX className="w-10 h-10 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar esta página. 
            Entre em contato com um administrador se precisar de acesso.
          </p>
        </div>

        <Button onClick={() => navigate("/dashboard")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Dashboard
        </Button>
      </div>
    </div>
  );
}
