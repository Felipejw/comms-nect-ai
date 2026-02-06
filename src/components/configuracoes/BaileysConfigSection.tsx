import { useState, useEffect } from "react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Server, 
  Eye, 
  EyeOff, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Save,
  AlertTriangle
} from "lucide-react";

// Normaliza a URL removendo sufixos indesejados
const normalizeUrl = (url: string): string => {
  let normalized = url.trim();
  
  // Remover trailing slashes
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  // Remover /health do final se existir
  if (normalized.endsWith('/health')) {
    normalized = normalized.slice(0, -7);
  }
  
  return normalized;
};

export function BaileysConfigSection() {
  const { getSetting, createOrUpdateSetting, isLoading } = useSystemSettings();
  
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"online" | "offline" | "auth_error" | "unknown">("unknown");
  const [connectionErrorMsg, setConnectionErrorMsg] = useState<string>("");
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Load initial values from settings ONLY on first load
  useEffect(() => {
    if (!isLoading && !initialLoadDone) {
      const savedUrl = getSetting("baileys_server_url");
      const savedKey = getSetting("baileys_api_key");
      if (savedUrl) setServerUrl(savedUrl);
      if (savedKey) setApiKey(savedKey);
      setInitialLoadDone(true);
    }
  }, [isLoading, initialLoadDone, getSetting]);

  // Auto-verify server status when settings are loaded
  useEffect(() => {
    if (initialLoadDone && serverUrl && apiKey && connectionStatus === "unknown") {
      handleTestConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadDone, serverUrl, apiKey]);

  const handleSave = async () => {
    if (!serverUrl || !apiKey) {
      toast.error("Preencha a URL e a API Key");
      return;
    }

    const normalizedUrl = normalizeUrl(serverUrl);
    
    // Atualiza o campo de input se a URL foi normalizada
    if (normalizedUrl !== serverUrl) {
      setServerUrl(normalizedUrl);
      toast.info("URL normalizada automaticamente");
    }

    setIsSaving(true);
    try {
      await createOrUpdateSetting.mutateAsync({
        key: "baileys_server_url",
        value: normalizedUrl,
        description: "URL do servidor Baileys WhatsApp",
        category: "whatsapp",
      });
      
      await createOrUpdateSetting.mutateAsync({
        key: "baileys_api_key",
        value: apiKey,
        description: "API Key do servidor Baileys",
        category: "whatsapp",
      });

      toast.success("Configurações do Baileys salvas!");
    } catch (error: any) {
      console.error("Error saving Baileys settings:", error);
      const errorMsg = error?.message || error?.toString() || 'Erro desconhecido';
      toast.error(`Erro ao salvar: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!serverUrl || !apiKey) {
      toast.error("Configure a URL e a API Key primeiro");
      return;
    }

    setIsTesting(true);
    setConnectionStatus("unknown");
    setConnectionErrorMsg("");
    
    try {
      console.log("Testing Baileys connection...");
      const { data, error } = await supabase.functions.invoke("baileys-instance", {
        body: { action: "serverHealth" },
      });

      console.log("Baileys test response:", { data, error });

      if (error) {
        console.error("Baileys test error:", error);
        setConnectionStatus("offline");
        setConnectionErrorMsg(error.message);
        toast.error(`Servidor Baileys não está respondendo: ${error.message}`);
        return;
      }

      if (data?.success) {
        setConnectionStatus("online");
        setConnectionErrorMsg("");
        toast.success("Servidor Baileys está online!");
      } else {
        const isAuthError = data?.errorCode === 401;
        setConnectionStatus(isAuthError ? "auth_error" : "offline");
        const errorMsg = data?.error || "Erro desconhecido";
        setConnectionErrorMsg(errorMsg);
        console.error("Baileys server error:", errorMsg);
        toast.error(isAuthError 
          ? "API Key inválida! A chave não corresponde à do servidor." 
          : `Servidor Baileys não está respondendo: ${errorMsg}`
        );
      }
    } catch (error: any) {
      console.error("Error testing Baileys connection:", error);
      setConnectionStatus("offline");
      setConnectionErrorMsg(error?.message || "Conexão recusada");
      toast.error(`Erro ao conectar: ${error?.message || "Conexão recusada"}`);
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "online":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
      case "auth_error":
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "offline":
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "online":
        return "Online";
      case "auth_error":
        return "API Key Inválida";
      case "offline":
        return "Offline";
      default:
        return "Não verificado";
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando configurações...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Server className="w-5 h-5" />
          Servidor WhatsApp (Baileys)
        </h3>
        <div className="flex items-center gap-2 text-sm">
          {getStatusIcon()}
          <span className={
            connectionStatus === "online" 
              ? "text-emerald-500 dark:text-emerald-400" 
              : connectionStatus === "auth_error"
                ? "text-amber-500"
                : connectionStatus === "offline" 
                  ? "text-destructive" 
                  : "text-muted-foreground"
          }>
            {getStatusText()}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="baileys-url">URL do Servidor</Label>
          <Input
            id="baileys-url"
            type="url"
            placeholder="https://seu-servidor.com"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="baileys-api-key">API Key</Label>
          <div className="relative">
            <Input
              id="baileys-api-key"
              type={showApiKey ? "text" : "password"}
              placeholder="Sua API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
          
          <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
            {isTesting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Testar Conexão
          </Button>
        </div>

        {/* Auth error diagnostic banner */}
        {connectionStatus === "auth_error" && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  API Key não corresponde ao servidor
                </p>
                <p className="text-muted-foreground mt-1">
                  A API Key configurada aqui é diferente da que o servidor Baileys está usando. 
                  Verifique a chave no servidor (variável <code className="bg-muted px-1 rounded">API_KEY</code> no container) 
                  e atualize o campo acima com o valor correto.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
