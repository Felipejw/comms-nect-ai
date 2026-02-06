import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionPlans } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MessageSquare,
  Building2,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, isSuperAdmin, loading, refreshUserData } = useAuth();
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans();

  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slug = generateSlug(companyName);

  // Redirect if already has tenant or is super admin
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
      return;
    }
    if (!loading && profile?.tenant_id) {
      navigate("/dashboard");
      return;
    }
    if (!loading && isSuperAdmin) {
      navigate("/dashboard");
      return;
    }
  }, [loading, user, profile, isSuperAdmin, navigate]);

  const handleNext = () => {
    if (companyName.trim().length < 2) {
      toast.error("Nome da empresa deve ter no mínimo 2 caracteres");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedPlanId) {
      toast.error("Selecione um plano para continuar");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-tenant", {
        body: {
          company_name: companyName.trim(),
          plan_id: selectedPlanId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Empresa configurada com sucesso! Bem-vindo ao TalkFlow!");

      // Refresh user data to pick up the new tenant_id
      await refreshUserData();

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast.error(error.message || "Erro ao configurar empresa");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-2/5 bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl text-sidebar-foreground">
            TalkFlow
          </span>
        </div>

        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-sidebar-foreground leading-tight">
            Configure sua empresa em poucos passos
          </h1>
          <p className="text-lg text-sidebar-foreground/70">
            Faltam apenas {step === 1 ? "2 passos" : "1 passo"} para você
            começar a usar o TalkFlow.
          </p>

          {/* Step Indicators */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-accent text-sidebar-foreground/50"
                }`}
              >
                {step > 1 ? <Check className="w-4 h-4" /> : "1"}
              </div>
              <span className="text-sidebar-foreground/90">
                Dados da empresa
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= 2
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-accent text-sidebar-foreground/50"
                }`}
              >
                2
              </div>
              <span className="text-sidebar-foreground/90">
                Escolha de plano
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm text-sidebar-foreground/50">
          © 2024 TalkFlow. Todos os direitos reservados.
        </p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-8">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">TalkFlow</span>
          </div>

          {/* Mobile Step Indicator */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
            <div
              className={`w-3 h-3 rounded-full ${
                step === 1 ? "bg-primary" : "bg-muted"
              }`}
            />
            <div
              className={`w-3 h-3 rounded-full ${
                step === 2 ? "bg-primary" : "bg-muted"
              }`}
            />
          </div>

          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-bold">
                  Qual é o nome da sua empresa?
                </h2>
                <p className="text-muted-foreground mt-2">
                  Este será o nome exibido para sua equipe e nos relatórios.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da empresa</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex: Minha Empresa LTDA"
                      className="pl-9"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    />
                  </div>
                </div>

                {slug && (
                  <p className="text-sm text-muted-foreground">
                    Identificador:{" "}
                    <span className="font-mono text-foreground">{slug}</span>
                  </p>
                )}
              </div>

              <Button
                onClick={handleNext}
                className="w-full"
                disabled={companyName.trim().length < 2}
              >
                Continuar
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-bold">Escolha seu plano</h2>
                <p className="text-muted-foreground mt-2">
                  Todos os planos incluem{" "}
                  <span className="font-semibold text-primary">
                    14 dias de trial gratuito
                  </span>
                  . Você pode mudar a qualquer momento.
                </p>
              </div>

              {plansLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {plans?.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    const features = Array.isArray(plan.features)
                      ? plan.features
                      : [];

                    return (
                      <Card
                        key={plan.id}
                        className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                          isSelected
                            ? "ring-2 ring-primary border-primary shadow-md"
                            : "hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedPlanId(plan.id)}
                      >
                        <CardContent className="p-5 space-y-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">
                                {plan.name}
                              </h3>
                              {plan.slug === "pro" && (
                                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                                  Popular
                                </span>
                              )}
                            </div>
                            {plan.description && (
                              <p className="text-sm text-muted-foreground">
                                {plan.description}
                              </p>
                            )}
                          </div>

                          <div>
                            <span className="text-3xl font-bold">
                              R${plan.price_monthly}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              /mês
                            </span>
                          </div>

                          <ul className="space-y-2">
                            {features.slice(0, 5).map((feature, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2 text-sm"
                              >
                                <Check className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                                <span>{String(feature)}</span>
                              </li>
                            ))}
                          </ul>

                          {isSelected && (
                            <div className="flex items-center justify-center gap-1 text-primary text-sm font-medium pt-2">
                              <Sparkles className="w-4 h-4" />
                              Selecionado
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1"
                  disabled={!selectedPlanId || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Configurando...
                    </>
                  ) : (
                    <>
                      Começar Trial Gratuito
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
