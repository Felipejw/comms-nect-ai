import { useState } from "react";
import { CreditCard, Check, Calendar, AlertCircle, History, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSubscriptionPlans, useMySubscription, useSubscriptionPayments, type SubscriptionPlan } from "@/hooks/useSubscription";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function PlansTab() {
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const { data: plans, isLoading: isLoadingPlans } = useSubscriptionPlans();
  const { data: subscription, isLoading: isLoadingSubscription } = useMySubscription();
  const { data: payments, isLoading: isLoadingPayments } = useSubscriptionPayments();

  const isLoading = isLoadingPlans || isLoadingSubscription;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Ativo</Badge>;
      case 'past_due':
        return <Badge variant="destructive">Pagamento Pendente</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelado</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expirado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500">Pago</Badge>;
      case 'pending':
        return <Badge variant="outline">Pendente</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      case 'refunded':
        return <Badge variant="secondary">Reembolsado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = subscription?.plan;

  return (
    <div className="space-y-6">
      {/* Current Subscription Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <CardTitle>Sua Assinatura</CardTitle>
            </div>
            {subscription && getStatusBadge(subscription.status)}
          </div>
          <CardDescription>
            Gerencie seu plano e visualize informações de cobrança
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription && currentPlan ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Plano Atual</p>
                <p className="font-semibold text-lg">{currentPlan.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Ciclo de Cobrança</p>
                <p className="font-semibold">
                  {subscription.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="font-semibold">
                  {formatCurrency(
                    subscription.billing_cycle === 'monthly' 
                      ? currentPlan.price_monthly 
                      : currentPlan.price_yearly
                  )}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{subscription.billing_cycle === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Próxima Cobrança</p>
                <p className="font-semibold flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(subscription.current_period_end), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Nenhuma assinatura ativa</h3>
              <p className="text-muted-foreground mb-4">
                Escolha um plano abaixo para começar a usar todos os recursos
              </p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Dialog open={showPaymentHistory} onOpenChange={setShowPaymentHistory}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="w-4 h-4 mr-2" />
                  Histórico de Pagamentos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Histórico de Pagamentos</DialogTitle>
                  <DialogDescription>
                    Visualize todos os pagamentos realizados
                  </DialogDescription>
                </DialogHeader>
                {isLoadingPayments ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : payments && payments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Fatura</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>
                            {payment.payment_method === 'pix' && 'PIX'}
                            {payment.payment_method === 'credit_card' && 'Cartão'}
                            {payment.payment_method === 'boleto' && 'Boleto'}
                            {!payment.payment_method && '-'}
                          </TableCell>
                          <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                          <TableCell>
                            {payment.invoice_url ? (
                              <Button variant="link" size="sm" asChild>
                                <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer">
                                  Ver
                                </a>
                              </Button>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum pagamento encontrado
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Planos Disponíveis</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans?.map((plan) => (
            <PlanCard 
              key={plan.id} 
              plan={plan} 
              isCurrentPlan={currentPlan?.id === plan.id}
              currentPlanOrder={currentPlan?.display_order}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan: boolean;
  currentPlanOrder?: number;
}

function PlanCard({ plan, isCurrentPlan, currentPlanOrder }: PlanCardProps) {
  const features = Array.isArray(plan.features) ? plan.features : [];
  const isUpgrade = currentPlanOrder !== undefined && plan.display_order > currentPlanOrder;
  const isDowngrade = currentPlanOrder !== undefined && plan.display_order < currentPlanOrder;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatLimit = (value: number | undefined) => {
    if (value === undefined) return '0';
    if (value === -1) return 'Ilimitado';
    return value.toString();
  };

  return (
    <Card className={`relative ${isCurrentPlan ? 'border-primary border-2' : ''}`}>
      {isCurrentPlan && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
          Plano Atual
        </Badge>
      )}
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold">
            {formatCurrency(plan.price_monthly)}
            <span className="text-sm font-normal text-muted-foreground">/mês</span>
          </p>
          <p className="text-sm text-muted-foreground">
            ou {formatCurrency(plan.price_yearly)}/ano (economia de {Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}%)
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Limites do Plano:</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• {formatLimit(plan.limits.max_users)} usuários</li>
            <li>• {formatLimit(plan.limits.max_connections)} conexões WhatsApp</li>
            <li>• {formatLimit(plan.limits.max_contacts)} contatos</li>
            <li>• {formatLimit(plan.limits.max_campaigns_month)} campanhas/mês</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Funcionalidades:</p>
          <ul className="space-y-1">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4">
          {isCurrentPlan ? (
            <Button variant="outline" className="w-full" disabled>
              Plano Atual
            </Button>
          ) : isUpgrade ? (
            <Button className="w-full">
              Fazer Upgrade
            </Button>
          ) : isDowngrade ? (
            <Button variant="outline" className="w-full">
              Fazer Downgrade
            </Button>
          ) : (
            <Button className="w-full">
              Assinar Plano
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
