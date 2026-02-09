import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { adminWrite } from '@/lib/adminWrite';

export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data || []) as Tag[];
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; color: string; description?: string }) => {
      const result = await adminWrite<Tag>({
        table: 'tags',
        operation: 'insert',
        data: input,
      });
      return result?.[0] || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar tag: ' + error.message);
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; color?: string; description?: string }) => {
      const result = await adminWrite<Tag>({
        table: 'tags',
        operation: 'update',
        data: input,
        filters: { id },
      });
      return result?.[0] || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar tag: ' + error.message);
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await adminWrite({
        table: 'tags',
        operation: 'delete',
        filters: { id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag excluída com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir tag: ' + error.message);
    },
  });
}

export function useAddTagToContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) => {
      await adminWrite({
        table: 'contact_tags',
        operation: 'insert',
        data: { contact_id: contactId, tag_id: tagId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao adicionar tag: ' + error.message);
    },
  });
}

export function useRemoveTagFromContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) => {
      await adminWrite({
        table: 'contact_tags',
        operation: 'delete',
        filters: { contact_id: contactId, tag_id: tagId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover tag: ' + error.message);
    },
  });
}
