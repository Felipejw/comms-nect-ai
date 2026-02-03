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
  Save
} from "lucide-react";

export function BaileysConfigSection() {
  const { getSetting, createOrUpdateSetting, isLoading } = useSystemSettings();
  
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"online" | "offline" | "unknown">("unknown");

  // Load initial values from settings
  useEffect(() => {
    if (!isLoading) {
      setServerUrl(getSetting("baileys_server_url"));
      setApiKey(getSetting("baileys_api_key"));
    }
  }, [isLoading, getSetting]);

  const handleSave = async () => {
    if (!serverUrl || !apiKey) {
      toast.error("Preencha a URL e a API Key");
      return;
    }

    setIsSaving(true);
    try {
      await createOrUpdateSetting.mutateAsync({
        key: "baileys_server_url",
        value: serverUrl,
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
    } catch (error) {
      console.error("Error saving Baileys settings:", error);
      toast.error("Erro ao salvar configurações");
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
    
    try {
      const { data, error } = await supabase.functions.invoke("baileys-instance", {
        body: { action: "serverHealth" },
      });

      if (error) throw error;

      if (data?.status === "online" || data?.success) {
        setConnectionStatus("online");
        toast.success("Servidor Baileys está online!");
      } else {
        setConnectionStatus("offline");
        toast.error("Servidor Baileys não está respondendo");
      }
    } catch (error) {
      console.error("Error testing Baileys connection:", error);
      setConnectionStatus("offline");
      toast.error("Erro ao conectar com o servidor Baileys");
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "online":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
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
      </div>
    </div>
  );
}
