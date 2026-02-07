import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  message: string;
  category: string | null;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useQuickReplies() {
  return useQuery({
    queryKey: ['quick-replies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return (data || []) as QuickReply[];
    },
  });
}

export function useCreateQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { shortcut: string; title: string; message: string; category?: string; created_by?: string }) => {
      const { data, error } = await supabase.from('quick_replies').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      toast.success('Resposta rápida criada com sucesso!');
    },
    onError: (error: Error) => { toast.error('Erro ao criar resposta rápida: ' + error.message); },
  });
}

export function useUpdateQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; shortcut?: string; title?: string; message?: string; category?: string }) => {
      const { data, error } = await supabase.from('quick_replies').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      toast.success('Resposta rápida atualizada com sucesso!');
    },
    onError: (error: Error) => { toast.error('Erro ao atualizar resposta rápida: ' + error.message); },
  });
}

export function useDeleteQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quick_replies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      toast.success('Resposta rápida excluída com sucesso!');
    },
    onError: (error: Error) => { toast.error('Erro ao excluir resposta rápida: ' + error.message); },
  });
}
