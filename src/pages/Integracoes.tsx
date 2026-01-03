import { useState, useEffect } from "react";
import { Plug, Calendar, Eye, EyeOff, ExternalLink, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GoogleCalendarConfig {
  client_id?: string;
  client_secret?: string;
  connected_email?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  [key: string]: string | undefined;
}

export default function Integracoes() {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  
  const [integration, setIntegration] = useState<{
    id: string;
    is_active: boolean;
    config: GoogleCalendarConfig;
  } | null>(null);

  // Load existing integration
  useEffect(() => {
    loadIntegration();
  }, []);

  const loadIntegration = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("type", "google_calendar")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const config = (data.config as GoogleCalendarConfig) || {};
        setIntegration({
          id: data.id,
          is_active: data.is_active || false,
          config,
        });
        setClientId(config.client_id || "");
        setClientSecret(config.client_secret || "");
      }
    } catch (error) {
      console.error("Erro ao carregar integração:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setIsSaving(true);
    try {
      const configData = {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        ...(integration?.config || {}),
      };

      if (integration) {
        // Update existing
        const { error } = await supabase
          .from("integrations")
          .update({
            config: configData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("integrations")
          .insert([{
            name: "Google Agenda",
            type: "google_calendar",
            config: configData,
            is_active: false,
          }]);

        if (error) throw error;
      }

      toast.success("Credenciais salvas com sucesso!");
      setIsConfigOpen(false);
      loadIntegration();
    } catch (error) {
      console.error("Erro ao salvar credenciais:", error);
      toast.error("Erro ao salvar credenciais");
    } finally {
      setIsSaving(false);
    }
  };

  const hasCredentials = !!(integration?.config?.client_id && integration?.config?.client_secret);
  const isConnected = !!(integration?.config?.access_token && integration?.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Plug className="w-7 h-7" />
          Integrações
        </h2>
        <p className="text-muted-foreground">Conecte serviços externos ao sistema</p>
      </div>

      {/* Google Calendar Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Agenda</CardTitle>
                <CardDescription>
                  Integre com Google Calendar para agendamentos via chatbot
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isConnected ? (
                <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                  <Check className="w-3 h-3 mr-1" />
                  Conectado
                </Badge>
              ) : hasCredentials ? (
                <Badge variant="secondary">Credenciais configuradas</Badge>
              ) : (
                <Badge variant="outline">Não configurado</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && integration?.config?.connected_email && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Conectado como: <span className="font-medium text-foreground">{integration.config.connected_email}</span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant={hasCredentials ? "outline" : "default"}
              onClick={() => setIsConfigOpen(true)}
            >
              {hasCredentials ? "Editar credenciais" : "Configurar credenciais"}
            </Button>

            {hasCredentials && !isConnected && (
              <Button disabled>
                Conectar conta Google (em breve)
              </Button>
            )}

            {isConnected && (
              <Button variant="destructive" disabled>
                Desconectar
              </Button>
            )}
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Para usar esta integração, você precisa criar um projeto no{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Google Cloud Console
                <ExternalLink className="w-3 h-3" />
              </a>
              {" "}e configurar as credenciais OAuth 2.0.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Future Integrations */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Plug className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Mais Integrações em Breve</h3>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            Em breve você poderá conectar mais serviços externos.
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

      {/* Config Dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Configurar Google Agenda
            </DialogTitle>
            <DialogDescription>
              Insira as credenciais OAuth 2.0 do seu projeto Google Cloud.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <div className="relative">
                <Input
                  id="client_id"
                  type={showClientId ? "text" : "password"}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowClientId(!showClientId)}
                >
                  {showClientId ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="client_secret"
                  type={showClientSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-xxxx"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                >
                  {showClientSecret ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium">Como obter as credenciais:</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Acesse o Google Cloud Console</li>
                <li>Crie um novo projeto ou selecione existente</li>
                <li>Ative a API do Google Calendar</li>
                <li>Configure a tela de consentimento OAuth</li>
                <li>Crie credenciais OAuth 2.0 (Web application)</li>
                <li>Copie o Client ID e Client Secret</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCredentials} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar credenciais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
