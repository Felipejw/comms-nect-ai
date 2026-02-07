import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { safeSettingUpsert } from "@/lib/safeSettingUpsert";

interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export function useSystemSettings() {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .order("key");

      if (error) throw error;
      return data as SystemSetting[];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await safeSettingUpsert({ key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Configuração atualizada!");
    },
    onError: (error: any) => {
      const msg = error?.message || 'desconhecido';
      console.error('System settings update error:', { code: error?.code, msg, details: error?.details, hint: error?.hint });
      toast.error(`Erro ao atualizar: ${msg}`);
    },
  });

  const createOrUpdateSetting = useMutation({
    mutationFn: async ({ 
      key, 
      value, 
      description, 
      category 
    }: { 
      key: string; 
      value: string; 
      description?: string;
      category?: string;
    }) => {
      await safeSettingUpsert({ key, value, description, category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Configuração salva!");
    },
    onError: (error: any) => {
      const msg = error?.message || 'desconhecido';
      console.error('System settings upsert error:', { code: error?.code, msg, details: error?.details, hint: error?.hint });
      toast.error(`Erro ao salvar: ${msg}`);
    },
  });

  const getSetting = (key: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || "";
  };

  return {
    settings,
    isLoading,
    updateSetting,
    createOrUpdateSetting,
    getSetting,
  };
}
