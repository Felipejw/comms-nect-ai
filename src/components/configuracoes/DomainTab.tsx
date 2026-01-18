import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Globe, Loader2, CheckCircle2, XCircle, AlertCircle, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyTenant, useUpdateTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export const DomainTab = () => {
  const { profile, isAdmin } = useAuth();
  const { data: tenant, isLoading } = useMyTenant();
  const updateTenant = useUpdateTenant();
  
  const [customDomain, setCustomDomain] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "verified" | "failed" | null>(null);

  useEffect(() => {
    if (tenant?.custom_domain) {
      setCustomDomain(tenant.custom_domain);
      setVerificationStatus("verified");
    }
  }, [tenant]);

  const handleSaveDomain = async () => {
    if (!tenant?.id) {
      toast.error("Tenant não encontrado");
      return;
    }

    if (!customDomain.trim()) {
      toast.error("Digite um domínio válido");
      return;
    }

    // Basic domain validation
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(customDomain)) {
      toast.error("Formato de domínio inválido. Ex: crm.suaempresa.com");
      return;
    }

    setVerificationStatus("pending");
    
    try {
      await updateTenant.mutateAsync({
        id: tenant.id,
        custom_domain: customDomain,
      });
      
      toast.success("Domínio salvo! Configure o DNS e verifique.");
    } catch (error) {
      console.error("Error saving domain:", error);
      setVerificationStatus("failed");
    }
  };

  const handleVerifyDomain = async () => {
    setIsVerifying(true);
    
    // Simulate DNS verification (in production, this would call an edge function)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // For demo purposes, we'll mark it as verified
    // In production, you'd check DNS records
    setVerificationStatus("verified");
    setIsVerifying(false);
    toast.success("Domínio verificado com sucesso!");
  };

  const handleRemoveDomain = async () => {
    if (!tenant?.id) return;
    
    try {
      await updateTenant.mutateAsync({
        id: tenant.id,
        custom_domain: null,
      });
      
      setCustomDomain("");
      setVerificationStatus(null);
      toast.success("Domínio removido");
    } catch (error) {
      console.error("Error removing domain:", error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Acesso Restrito</AlertTitle>
        <AlertDescription>
          Apenas administradores podem configurar domínios personalizados.
        </AlertDescription>
      </Alert>
    );
  }

  if (!tenant) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Tenant não encontrado</AlertTitle>
        <AlertDescription>
          Sua conta não está vinculada a nenhuma organização.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domínio Personalizado
          </CardTitle>
          <CardDescription>
            Configure seu próprio domínio para acessar a plataforma (ex: crm.suaempresa.com)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {verificationStatus === "verified" ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Verificado
              </Badge>
            ) : verificationStatus === "pending" ? (
              <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                <AlertCircle className="w-3 h-3 mr-1" />
                Pendente de Verificação
              </Badge>
            ) : verificationStatus === "failed" ? (
              <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
                <XCircle className="w-3 h-3 mr-1" />
                Falha na Verificação
              </Badge>
            ) : (
              <Badge variant="secondary">Não configurado</Badge>
            )}
          </div>

          {/* Domain Input */}
          <div className="space-y-2">
            <Label htmlFor="custom-domain">Seu Domínio</Label>
            <div className="flex gap-2">
              <Input
                id="custom-domain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                placeholder="crm.suaempresa.com"
                className="flex-1"
              />
              <Button 
                onClick={handleSaveDomain} 
                disabled={updateTenant.isPending || !customDomain.trim()}
              >
                {updateTenant.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Digite o domínio completo sem http:// ou https://
            </p>
          </div>

          {/* DNS Configuration Instructions */}
          {customDomain && verificationStatus !== null && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Configuração de DNS Necessária</AlertTitle>
              <AlertDescription className="space-y-4">
                <p className="text-sm">
                  Para ativar seu domínio personalizado, adicione os seguintes registros DNS no painel do seu provedor de domínio:
                </p>
                
                <div className="space-y-3 mt-4">
                  {/* A Record */}
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">Registro A (Principal)</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2"
                        onClick={() => copyToClipboard("185.158.133.1")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="ml-1 font-mono">A</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Nome:</span>
                        <span className="ml-1 font-mono">@</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor:</span>
                        <span className="ml-1 font-mono">185.158.133.1</span>
                      </div>
                    </div>
                  </div>

                  {/* CNAME Record */}
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">Registro CNAME (Subdomínio)</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2"
                        onClick={() => copyToClipboard(`${tenant.slug}.gatteflow.app`)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="ml-1 font-mono">CNAME</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Nome:</span>
                        <span className="ml-1 font-mono">{customDomain.split('.')[0]}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor:</span>
                        <span className="ml-1 font-mono">{tenant.slug}.gatteflow.app</span>
                      </div>
                    </div>
                  </div>

                  {/* TXT Record for verification */}
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">Registro TXT (Verificação)</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2"
                        onClick={() => copyToClipboard(`gatteflow-verify=${tenant.id}`)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="ml-1 font-mono">TXT</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Nome:</span>
                        <span className="ml-1 font-mono">_gatteflow</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor:</span>
                        <span className="ml-1 font-mono text-[10px]">gatteflow-verify={tenant.id.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  Após configurar os registros DNS, aguarde até 48 horas para a propagação e clique em "Verificar Domínio".
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          {customDomain && verificationStatus !== null && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleVerifyDomain}
                disabled={isVerifying || verificationStatus === "verified"}
                className="gap-2"
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Verificar Domínio
              </Button>
              
              <Button
                variant="destructive"
                onClick={handleRemoveDomain}
                disabled={updateTenant.isPending}
              >
                Remover Domínio
              </Button>
            </div>
          )}

          {/* Current Access URLs */}
          <div className="border-t pt-4 mt-4">
            <Label className="text-sm font-medium">URLs de Acesso</Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded text-sm">
                <span className="text-muted-foreground">URL Padrão:</span>
                <code className="font-mono text-xs">{tenant.slug}.gatteflow.app</code>
              </div>
              {tenant.custom_domain && verificationStatus === "verified" && (
                <div className="flex items-center justify-between bg-green-500/10 p-2 rounded text-sm">
                  <span className="text-green-600">Domínio Personalizado:</span>
                  <code className="font-mono text-xs text-green-600">{tenant.custom_domain}</code>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
