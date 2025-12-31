import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface KanbanConversation {
  id: string;
  contact_id: string;
  subject: string | null;
  status: string;
  priority: number;
  kanban_column_id: string | null;
  last_message_at: string | null;
  created_at: string;
  contact: {
    id: string;
    name: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
  assignee: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
}

export function useKanbanColumns() {
  return useQuery({
    queryKey: ["kanban-columns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_columns")
        .select("*")
        .order("position", { ascending: true });

      if (error) throw error;
      return data as KanbanColumn[];
    },
  });
}

export function useKanbanConversations() {
  return useQuery({
    queryKey: ["kanban-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id,
          contact_id,
          subject,
          status,
          priority,
          kanban_column_id,
          last_message_at,
          created_at,
          assigned_to,
          contacts:contact_id (id, name, phone, avatar_url)
        `)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      // Get assignee profiles
      const assignedIds = [...new Set((data || []).map(c => c.assigned_to).filter(Boolean))];
      let assigneeMap = new Map<string, { id: string; name: string; avatar_url: string | null }>();
      
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", assignedIds);
        
        profiles?.forEach(p => assigneeMap.set(p.user_id, { id: p.user_id, name: p.name, avatar_url: p.avatar_url }));
      }

      // Get conversation tags
      const conversationIds = (data || []).map(c => c.id);
      let tagsMap = new Map<string, { id: string; name: string; color: string }[]>();
      
      if (conversationIds.length > 0) {
        const { data: convTags } = await supabase
          .from("conversation_tags")
          .select(`
            conversation_id,
            tag:tags(id, name, color)
          `)
          .in("conversation_id", conversationIds);
        
        convTags?.forEach(ct => {
          const tag = ct.tag as unknown as { id: string; name: string; color: string };
          if (tag) {
            const existing = tagsMap.get(ct.conversation_id) || [];
            existing.push(tag);
            tagsMap.set(ct.conversation_id, existing);
          }
        });
      }

      return (data || []).map(conv => ({
        id: conv.id,
        contact_id: conv.contact_id,
        subject: conv.subject,
        status: conv.status,
        priority: conv.priority,
        kanban_column_id: conv.kanban_column_id,
        last_message_at: conv.last_message_at,
        created_at: conv.created_at,
        contact: conv.contacts as { id: string; name: string; phone: string | null; avatar_url: string | null } | null,
        assignee: conv.assigned_to ? assigneeMap.get(conv.assigned_to) || null : null,
        tags: tagsMap.get(conv.id) || [],
      })) as KanbanConversation[];
    },
  });
}

export function useCreateKanbanColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; color: string; position: number }) => {
      const { data: result, error } = await supabase
        .from("kanban_columns")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-columns"] });
      toast.success("Coluna criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar coluna: " + error.message);
    },
  });
}

export function useUpdateKanbanColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; color?: string; position?: number }) => {
      const { error } = await supabase
        .from("kanban_columns")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-columns"] });
      toast.success("Coluna atualizada!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar coluna: " + error.message);
    },
  });
}

export function useDeleteKanbanColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First, update conversations to remove the column reference
      await supabase
        .from("conversations")
        .update({ kanban_column_id: null })
        .eq("kanban_column_id", id);

      const { error } = await supabase
        .from("kanban_columns")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-columns"] });
      queryClient.invalidateQueries({ queryKey: ["kanban-conversations"] });
      toast.success("Coluna excluída!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir coluna: " + error.message);
    },
  });
}

export function useMoveConversationToColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, columnId }: { conversationId: string; columnId: string | null }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ kanban_column_id: columnId })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-conversations"] });
    },
    onError: (error) => {
      toast.error("Erro ao mover conversa: " + error.message);
    },
  });
}
