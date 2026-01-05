import { useState, useEffect, useCallback } from "react";
import { Plug, Eye, EyeOff, ExternalLink, Check, Loader2, RefreshCw, LogOut, ChevronDown } from "lucide-react";
import googleCalendarLogo from "@/assets/google-calendar-logo.png";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GoogleCalendarConfig {
  client_id?: string;
  client_secret?: string;
  connected_email?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  selected_calendar_id?: string;
  [key: string]: string | undefined;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  backgroundColor?: string;
}

export default function Integracoes() {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  
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
        const { error } = await supabase
          .from("integrations")
          .update({
            config: configData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id);

        if (error) throw error;
      } else {
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

  // Handle OAuth callback
  const handleOAuthCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const stateParam = urlParams.get("state");

    if (code && stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        const integrationId = state.integration_id;

        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);

        setIsConnecting(true);

        const { data, error } = await supabase.functions.invoke("google-auth", {
          body: {
            action: "callback",
            integration_id: integrationId,
            code,
            redirect_uri: window.location.origin + "/integracoes",
          },
        });

        if (error) throw error;

        if (data?.success) {
          toast.success(`Conectado como ${data.email}`);
          loadIntegration();
        } else {
          throw new Error(data?.error || "Erro desconhecido");
        }
      } catch (error) {
        console.error("OAuth callback error:", error);
        toast.error("Erro ao conectar conta Google");
      } finally {
        setIsConnecting(false);
      }
    }
  }, []);

  useEffect(() => {
    handleOAuthCallback();
  }, [handleOAuthCallback]);

  const handleConnectGoogle = async () => {
    if (!integration?.id) {
      toast.error("Configure as credenciais primeiro");
      return;
    }

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-auth", {
        body: {
          action: "authorize",
          integration_id: integration.id,
          redirect_uri: window.location.origin + "/integracoes",
        },
      });

      if (error) throw error;

      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error("URL de autorização não gerada");
      }
    } catch (error) {
      console.error("Erro ao iniciar OAuth:", error);
      toast.error("Erro ao conectar com Google");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!integration?.id) return;

    try {
      const { error } = await supabase.functions.invoke("google-auth", {
        body: {
          action: "disconnect",
          integration_id: integration.id,
        },
      });

      if (error) throw error;

      toast.success("Conta desconectada");
      loadIntegration();
      setCalendars([]);
    } catch (error) {
      console.error("Erro ao desconectar:", error);
      toast.error("Erro ao desconectar conta");
    }
  };

  const loadCalendars = async () => {
    if (!integration?.id) return;

    setIsLoadingCalendars(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          action: "list-calendars",
          integration_id: integration.id,
        },
      });

      if (error) throw error;

      setCalendars(data?.calendars || []);
    } catch (error) {
      console.error("Erro ao carregar calendários:", error);
      toast.error("Erro ao carregar calendários");
    } finally {
      setIsLoadingCalendars(false);
    }
  };

  useEffect(() => {
    if (integration?.is_active && integration.config?.access_token) {
      loadCalendars();
    }
  }, [integration?.is_active, integration?.config?.access_token]);

  const handleSelectCalendar = async (calendarId: string) => {
    if (!integration?.id) return;

    try {
      const updatedConfig = {
        ...integration.config,
        selected_calendar_id: calendarId,
      };

      const { error } = await supabase
        .from("integrations")
        .update({
          config: updatedConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      if (error) throw error;

      setIntegration({
        ...integration,
        config: updatedConfig,
      });

      const calendar = calendars.find(c => c.id === calendarId);
      toast.success(`Calendário "${calendar?.summary}" selecionado`);
    } catch (error) {
      console.error("Erro ao selecionar calendário:", error);
      toast.error("Erro ao selecionar calendário");
    }
  };

  const hasCredentials = !!(integration?.config?.client_id && integration?.config?.client_secret);
  const isConnected = !!(integration?.config?.access_token && integration?.is_active);
  const selectedCalendar = calendars.find(c => c.id === integration?.config?.selected_calendar_id);

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
              <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                <img 
                  src={googleCalendarLogo} 
                  alt="Google Agenda" 
                  className="w-10 h-10 object-contain"
                />
              </div>
              <div>
                <CardTitle className="text-lg">Google Agenda</CardTitle>
                <CardDescription>
                  Integre com Google Calendar para agendamentos via chatbot
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isLoading || isConnecting ? (
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
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">
                Conectado como: <span className="font-medium text-foreground">{integration.config.connected_email}</span>
              </p>
              
              {/* Calendar Selector */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">Calendário:</Label>
                <Select
                  value={integration.config.selected_calendar_id || ""}
                  onValueChange={handleSelectCalendar}
                  disabled={isLoadingCalendars}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um calendário">
                      {isLoadingCalendars ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Carregando...
                        </span>
                      ) : selectedCalendar ? (
                        <span className="flex items-center gap-2">
                          {selectedCalendar.backgroundColor && (
                            <span 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: selectedCalendar.backgroundColor }}
                            />
                          )}
                          {selectedCalendar.summary}
                        </span>
                      ) : (
                        "Selecione um calendário"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        <span className="flex items-center gap-2">
                          {cal.backgroundColor && (
                            <span 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: cal.backgroundColor }}
                            />
                          )}
                          {cal.summary}
                          {cal.primary && (
                            <Badge variant="outline" className="text-xs ml-1">Principal</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={loadCalendars}
                  disabled={isLoadingCalendars}
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingCalendars ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!isConnected && (
              <Button
                variant={hasCredentials ? "outline" : "default"}
                onClick={() => setIsConfigOpen(true)}
              >
                {hasCredentials ? "Editar credenciais" : "Configurar credenciais"}
              </Button>
            )}

            {hasCredentials && !isConnected && (
              <Button onClick={handleConnectGoogle} disabled={isConnecting}>
                {isConnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Conectar conta Google
              </Button>
            )}

            {isConnected && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Opções
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setIsConfigOpen(true)}>
                    Editar credenciais
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleDisconnect}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Desconectar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <img src={googleCalendarLogo} alt="Google Agenda" className="w-5 h-5 object-contain" />
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
                <li>
                  Adicione esta URL de redirecionamento:
                  <code className="block mt-1 p-2 bg-background rounded text-xs break-all">
                    {window.location.origin}/integracoes
                  </code>
                </li>
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
