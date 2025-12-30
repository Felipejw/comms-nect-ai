import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Queue {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: 'active' | 'paused';
  auto_assign: boolean;
  max_concurrent: number;
  created_at: string;
  updated_at: string;
}

export interface QueueAgent {
  id: string;
  queue_id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
  profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

export function useQueues() {
  return useQuery({
    queryKey: ['queues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data || []) as Queue[];
    },
  });
}

export function useQueueAgents(queueId: string) {
  return useQuery({
    queryKey: ['queue-agents', queueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queue_agents')
        .select('*')
        .eq('queue_id', queueId);

      if (error) throw error;
      
      // Fetch profiles separately
      const userIds = [...new Set((data || []).map(a => a.user_id))];
      
      let profileMap = new Map();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, name, avatar_url')
          .in('user_id', userIds);
        
        profiles?.forEach(p => profileMap.set(p.user_id, p));
      }
      
      return (data || []).map(agent => ({
        ...agent,
        profile: profileMap.get(agent.user_id) || null,
      })) as QueueAgent[];
    },
    enabled: !!queueId,
  });
}

export function useCreateQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      color?: string;
      auto_assign?: boolean;
      max_concurrent?: number;
    }) => {
      const { data, error } = await supabase
        .from('queues')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Fila criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar fila: ' + error.message);
    },
  });
}

export function useUpdateQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string;
      color?: string;
      status?: Queue['status'];
      auto_assign?: boolean;
      max_concurrent?: number;
    }) => {
      const { data, error } = await supabase
        .from('queues')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Fila atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar fila: ' + error.message);
    },
  });
}

export function useDeleteQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('queues')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Fila excluída com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir fila: ' + error.message);
    },
  });
}

export function useAddAgentToQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ queueId, userId }: { queueId: string; userId: string }) => {
      const { error } = await supabase
        .from('queue_agents')
        .insert({ queue_id: queueId, user_id: userId });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['queue-agents', variables.queueId] });
      toast.success('Agente adicionado à fila!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao adicionar agente: ' + error.message);
    },
  });
}

export function useRemoveAgentFromQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ queueId, userId }: { queueId: string; userId: string }) => {
      const { error } = await supabase
        .from('queue_agents')
        .delete()
        .eq('queue_id', queueId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['queue-agents', variables.queueId] });
      toast.success('Agente removido da fila!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover agente: ' + error.message);
    },
  });
}
