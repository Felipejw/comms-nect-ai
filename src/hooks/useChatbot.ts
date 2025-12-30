import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChatbotRule {
  id: string;
  trigger_text: string;
  response: string;
  match_type: 'exact' | 'contains' | 'starts_with' | 'regex';
  is_active: boolean;
  priority: number;
  match_count: number;
  queue_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AISettings {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_enabled: boolean;
  knowledge_base: string | null;
  created_at: string;
  updated_at: string;
}

export function useChatbotRules() {
  return useQuery({
    queryKey: ['chatbot-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chatbot_rules')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;
      return (data || []) as ChatbotRule[];
    },
  });
}

export function useCreateChatbotRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      trigger_text: string;
      response: string;
      match_type?: ChatbotRule['match_type'];
      is_active?: boolean;
      priority?: number;
      queue_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('chatbot_rules')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-rules'] });
      toast.success('Regra criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar regra: ' + error.message);
    },
  });
}

export function useUpdateChatbotRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      trigger_text?: string;
      response?: string;
      match_type?: ChatbotRule['match_type'];
      is_active?: boolean;
      priority?: number;
      queue_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('chatbot_rules')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-rules'] });
      toast.success('Regra atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar regra: ' + error.message);
    },
  });
}

export function useDeleteChatbotRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('chatbot_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-rules'] });
      toast.success('Regra excluída com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir regra: ' + error.message);
    },
  });
}

// AI Settings
export function useAISettings() {
  return useQuery({
    queryKey: ['ai-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as AISettings | null;
    },
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      system_prompt?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      is_enabled?: boolean;
      knowledge_base?: string;
    }) => {
      const { data, error } = await supabase
        .from('ai_settings')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('Configurações de IA atualizadas!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar configurações: ' + error.message);
    },
  });
}
