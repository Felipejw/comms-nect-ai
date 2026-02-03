import { useState } from "react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { BaileysConfigSection } from "./BaileysConfigSection";

interface SettingOptionProps {
  label: string;
  settingKey: string;
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  isUpdating?: boolean;
}

function SettingOption({
  label,
  value,
  onChange,
  options = [
    { value: "enabled", label: "Habilitado" },
    { value: "disabled", label: "Desabilitado" },
  ],
}: SettingOptionProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function OptionsTab() {
  const { getSetting, updateSetting, isLoading } = useSystemSettings();
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);

  const handleChange = (key: string, value: string) => {
    updateSetting.mutate({ key, value });
  };

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-contacts');
      
      if (error) throw error;
      
      toast.success(
        `Sincronização concluída! Atualizados: ${data.updated}, Ignorados: ${data.skipped}, Falhas: ${data.failed}`
      );
    } catch (error) {
      console.error('Error syncing contacts:', error);
      toast.error('Erro ao sincronizar contatos');
    } finally {
      setIsSyncingContacts(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuração do Servidor Baileys */}
      <BaileysConfigSection />

      {/* Ações de Manutenção */}
      <div className="bg-card rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Manutenção de Contatos
        </h3>
        <div className="flex flex-wrap gap-4">
          <Button
            variant="outline"
            onClick={handleSyncContacts}
            disabled={isSyncingContacts}
          >
            {isSyncingContacts ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sincronizar Nomes dos Contatos
          </Button>
          <p className="text-sm text-muted-foreground self-center">
            Busca e atualiza os nomes dos contatos via WhatsApp
          </p>
        </div>
      </div>

      {/* Configurações */}
      <div className="bg-card rounded-lg p-6">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Coluna Esquerda */}
        <div className="space-y-6">
          <SettingOption
            label="Enviar mensagem transferência de setor/atendente"
            settingKey="send_transfer_message"
            value={getSetting("send_transfer_message")}
            onChange={(v) => handleChange("send_transfer_message", v)}
          />
          <SettingOption
            label="Permite o usuário Atendente escolher ENVIAR Assinatura"
            settingKey="allow_operator_signature"
            value={getSetting("allow_operator_signature")}
            onChange={(v) => handleChange("allow_operator_signature", v)}
          />
          <SettingOption
            label="Tag obrigatória para fechar ticket"
            settingKey="require_tag_to_close"
            value={getSetting("require_tag_to_close")}
            onChange={(v) => handleChange("require_tag_to_close", v)}
          />
        </div>

        {/* Coluna Central */}
        <div className="space-y-6">
          <SettingOption
            label="Enviar saudação ao aceitar conversa"
            settingKey="send_greeting_on_accept"
            value={getSetting("send_greeting_on_accept")}
            onChange={(v) => handleChange("send_greeting_on_accept", v)}
          />
          <SettingOption
            label="Aceita receber áudio de todas conversas?"
            settingKey="accept_audio_all_conversations"
            value={getSetting("accept_audio_all_conversations")}
            onChange={(v) => handleChange("accept_audio_all_conversations", v)}
          />
          <SettingOption
            label="Fechar conversa ao transferir para outro setor?"
            settingKey="close_on_transfer"
            value={getSetting("close_on_transfer")}
            onChange={(v) => handleChange("close_on_transfer", v)}
          />
        </div>

        {/* Coluna Direita */}
        <div className="space-y-6">
          <SettingOption
            label="Escolher atendente aleatório"
            settingKey="random_operator_selection"
            value={getSetting("random_operator_selection")}
            onChange={(v) => handleChange("random_operator_selection", v)}
          />
          <SettingOption
            label="Informar que não aceita ligação no WhatsApp?"
            settingKey="reject_whatsapp_calls"
            value={getSetting("reject_whatsapp_calls")}
            onChange={(v) => handleChange("reject_whatsapp_calls", v)}
            options={[
              { value: "enabled", label: "Habilitado" },
              { value: "disabled", label: "Desabilitado" },
              { value: "always", label: "Sempre que alguém ligar" },
            ]}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
