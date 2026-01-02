import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      const { error } = await supabase
        .from("system_settings")
        .update({ value })
        .eq("key", key);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Configuração atualizada!");
    },
    onError: () => {
      toast.error("Erro ao atualizar configuração");
    },
  });

  const getSetting = (key: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || "disabled";
  };

  return {
    settings,
    isLoading,
    updateSetting,
    getSetting,
  };
}
