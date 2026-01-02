import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Schedule {
  id: string;
  contact_id: string | null;
  conversation_id: string | null;
  user_id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  status: 'pending' | 'completed' | 'cancelled';
  reminder: boolean;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
  contact?: {
    id: string;
    name: string;
    phone: string | null;
  };
  conversation?: {
    id: string;
    contact?: {
      name: string;
    };
  };
}

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          contact:contacts (id, name, phone),
          conversation:conversations (id, contact:contacts (name))
        `)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Schedule[];
    },
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      contact_id?: string;
      conversation_id?: string;
      user_id: string;
      title: string;
      description?: string;
      message_content?: string;
      scheduled_at: string;
      reminder?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('schedules')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Agendamento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar agendamento: ' + error.message);
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      title?: string;
      description?: string;
      scheduled_at?: string;
      status?: Schedule['status'];
      reminder?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('schedules')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Agendamento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar agendamento: ' + error.message);
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Agendamento excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir agendamento: ' + error.message);
    },
  });
}
