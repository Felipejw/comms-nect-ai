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
  session_data: { instanceName?: string } | null;
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
    mutationFn: async (instanceName: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-instance", {
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

  const getQrCode = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-instance", {
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
      const { data, error } = await supabase.functions.invoke("evolution-instance", {
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
      const { data, error } = await supabase.functions.invoke("evolution-instance", {
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
      const { data, error } = await supabase.functions.invoke("evolution-instance", {
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

  const recreateConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-instance", {
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
        description: "Nova instância criada, escaneie o QR Code",
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

  return {
    connections,
    isLoading,
    refetch,
    createConnection,
    getQrCode,
    checkStatus,
    disconnect,
    deleteConnection,
    recreateConnection,
  };
}
