import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ConversationTag {
  id: string;
  conversation_id: string;
  tag_id: string;
  created_at: string;
  tag?: {
    id: string;
    name: string;
    color: string;
    description: string | null;
  };
}

export function useConversationTags(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-tags', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await supabase
        .from('conversation_tags')
        .select(`
          id,
          conversation_id,
          tag_id,
          created_at,
          tag:tags(id, name, color, description)
        `)
        .eq('conversation_id', conversationId);

      if (error) throw error;
      return (data || []) as ConversationTag[];
    },
    enabled: !!conversationId,
  });
}

export function useAddTagToConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, tagId }: { conversationId: string; tagId: string }) => {
      const { data, error } = await supabase
        .from('conversation_tags')
        .insert({ conversation_id: conversationId, tag_id: tagId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-tags', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Tag adicionada à conversa!');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Esta tag já está na conversa');
      } else {
        toast.error('Erro ao adicionar tag: ' + error.message);
      }
    },
  });
}

export function useRemoveTagFromConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, tagId }: { conversationId: string; tagId: string }) => {
      const { error } = await supabase
        .from('conversation_tags')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-tags', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Tag removida da conversa!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover tag: ' + error.message);
    },
  });
}
