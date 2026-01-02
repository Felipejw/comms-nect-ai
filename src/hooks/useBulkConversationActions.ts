import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useBulkDeleteConversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (conversationIds: string[]) => {
      // Delete messages first
      for (const id of conversationIds) {
        const { error: messagesError } = await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", id);
        
        if (messagesError) throw messagesError;
      }
      
      // Delete conversation tags
      for (const id of conversationIds) {
        const { error: tagsError } = await supabase
          .from("conversation_tags")
          .delete()
          .eq("conversation_id", id);
        
        if (tagsError) throw tagsError;
      }
      
      // Delete conversations
      const { error } = await supabase
        .from("conversations")
        .delete()
        .in("id", conversationIds);
      
      if (error) throw error;
      
      return conversationIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Conversas excluídas",
        description: `${count} conversa(s) excluída(s) com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error deleting conversations:", error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir as conversas",
        variant: "destructive",
      });
    },
  });
}

export function useBulkUpdateConversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      ids, 
      updates 
    }: { 
      ids: string[]; 
      updates: { 
        status?: "new" | "in_progress" | "resolved" | "archived";
        assigned_to?: string | null;
        queue_id?: string | null;
        is_bot_active?: boolean;
      } 
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update(updates)
        .in("id", ids);
      
      if (error) throw error;
      
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Conversas atualizadas",
        description: `${count} conversa(s) atualizada(s) com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error updating conversations:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar as conversas",
        variant: "destructive",
      });
    },
  });
}
