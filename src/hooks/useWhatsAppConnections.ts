import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface WhatsAppConnection {
  id: string;
  name: string;
  type: string;
  status: string;
  phone_number: string | null;
  qr_code: string | null;
  is_default: boolean;
  session_data: { 
    sessionName?: string; 
    token?: string; 
    instanceName?: string;
    engine?: 'waha' | 'baileys';
  } | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export function useWhatsAppConnections() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: connections = [], isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("type", "whatsapp")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as WhatsAppConnection[];
    },
  });

  const createConnection = useMutation({
    mutationFn: async ({ instanceName, engine = 'baileys' }: { instanceName: string; engine?: 'waha' | 'baileys' }) => {
      const functionName = engine === 'baileys' ? 'baileys-instance' : 'waha-instance';
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "create", instanceName },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
      toast({
        title: "Conexão criada",
        description: "Escaneie o QR Code para conectar",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar conexão",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getEdgeFunctionName = (connectionId: string): string => {
    const connection = connections.find(c => c.id === connectionId);
    return connection?.session_data?.engine === 'baileys' ? 'baileys-instance' : 'waha-instance';
  };

  const getQrCode = useMutation({
    mutationFn: async (connectionId: string) => {
      const functionName = getEdgeFunctionName(connectionId);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "getQrCode", connectionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
    },
  });

  const checkStatus = useMutation({
    mutationFn: async (connectionId: string) => {
      const functionName = getEdgeFunctionName(connectionId);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "status", connectionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
    },
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => {
      const functionName = getEdgeFunctionName(connectionId);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "disconnect", connectionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
      toast({
        title: "Desconectado",
        description: "Dispositivo desconectado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const functionName = getEdgeFunctionName(connectionId);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "delete", connectionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
      toast({
        title: "Conexão excluída",
        description: "Conexão removida com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConnection = useMutation({
    mutationFn: async ({ connectionId, name, color }: { connectionId: string; name?: string; color?: string }) => {
      const updates: { name?: string; color?: string; updated_at: string } = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;
      
      const { data, error } = await supabase
        .from("connections")
        .update(updates)
        .eq("id", connectionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Conexão atualizada",
        description: "Alterações salvas com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const recreateConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const functionName = getEdgeFunctionName(connectionId);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "recreate", connectionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections"] });
      toast({
        title: "Reconectando",
        description: "Nova sessão criada, escaneie o QR Code",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkServerHealth = useMutation({
    mutationFn: async (engine: 'waha' | 'baileys' = 'baileys') => {
      const functionName = engine === 'baileys' ? 'baileys-instance' : 'waha-instance';
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "serverHealth" },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
  });

  const cleanupOrphaned = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("waha-instance", {
        body: { action: "cleanupOrphanedInstances" },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.deleted?.length > 0) {
        toast({
          title: "Limpeza concluída",
          description: `${data.deleted.length} sessão(ões) órfã(s) removida(s)`,
        });
      } else {
        toast({
          title: "Nenhuma limpeza necessária",
          description: "Todas as sessões estão sincronizadas",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro na limpeza",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    connections,
    isLoading,
    refetch,
    createConnection,
    getQrCode,
    checkStatus,
    disconnect,
    deleteConnection,
    updateConnection,
    recreateConnection,
    checkServerHealth,
    cleanupOrphaned,
  };
}
