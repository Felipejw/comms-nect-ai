import { AlertTriangle, CreditCard, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface SubscriptionBlockerProps {
  subscriptionStatus: string;
  expiresAt?: string;
}

export function SubscriptionBlocker({ subscriptionStatus, expiresAt }: SubscriptionBlockerProps) {
  const { tenant } = useAuth();
  const navigate = useNavigate();

  const isExpired = subscriptionStatus === 'expired';
  const isPastDue = subscriptionStatus === 'past_due';
  const isCancelled = subscriptionStatus === 'cancelled';

  if (!isExpired && !isCancelled) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">
            {isExpired && "Assinatura Expirada"}
            {isCancelled && "Assinatura Cancelada"}
          </CardTitle>
          <CardDescription className="text-base">
            {isExpired && (
              <>
                Sua assinatura expirou em{" "}
                {expiresAt && new Date(expiresAt).toLocaleDateString('pt-BR')}.
                <br />
                Renove agora para continuar usando o sistema.
              </>
            )}
            {isCancelled && (
              <>
                Sua assinatura foi cancelada.
                <br />
                Assine novamente para recuperar o acesso.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Empresa:</p>
            <p className="font-medium">{tenant?.name || "Não identificado"}</p>
          </div>

          <Button className="w-full" size="lg" onClick={() => navigate('/configuracoes?tab=planos')}>
            <CreditCard className="w-4 h-4 mr-2" />
            Renovar Assinatura
          </Button>

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Precisa de ajuda?
            </p>
            <Button variant="outline" size="sm">
              <Phone className="w-4 h-4 mr-2" />
              Falar com Suporte
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
