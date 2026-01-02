import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Contact } from './useContacts';

export interface ContactConversationHistory {
  id: string;
  status: 'new' | 'in_progress' | 'resolved' | 'archived';
  created_at: string;
  last_message_at: string;
  subject: string | null;
  kanban_column_id: string | null;
}

export function useContactProfile(contactId: string) {
  return useQuery({
    queryKey: ['contact-profile', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          contact_tags (
            tag_id,
            tags (id, name, color)
          )
        `)
        .eq('id', contactId)
        .single();

      if (error) throw error;
      
      return {
        ...data,
        tags: data.contact_tags?.map((ct: any) => ct.tags).filter(Boolean) || []
      } as Contact;
    },
    enabled: !!contactId,
  });
}

export function useContactConversationHistory(contactId: string) {
  return useQuery({
    queryKey: ['contact-conversation-history', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, status, created_at, last_message_at, subject, kanban_column_id')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as ContactConversationHistory[];
    },
    enabled: !!contactId,
  });
}

export function useUpdateContactNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, notes }: { contactId: string; notes: string }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update({ notes })
        .eq('id', contactId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: ['contact-profile', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Notas atualizadas!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar notas: ' + error.message);
    },
  });
}

export function useFetchWhatsAppProfilePicture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId }: { contactId: string }) => {
      const { data, error } = await supabase.functions.invoke('fetch-whatsapp-profile', {
        body: { contactId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao buscar foto');
      
      return data.avatarUrl;
    },
    onSuccess: (_, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: ['contact-profile', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Foto de perfil atualizada!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao buscar foto: ' + error.message);
    },
  });
}
