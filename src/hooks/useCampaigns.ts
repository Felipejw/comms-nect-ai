import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  message: string;
  media_url: string | null;
  media_type: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  scheduled_at: string | null;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // New fields
  message_variations: string[] | null;
  use_variations: boolean | null;
  use_buttons: boolean | null;
  buttons: Array<{ id: string; text: string }> | null;
  min_interval: number | null;
  max_interval: number | null;
  template_id: string | null;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  retry_count: number | null;
  last_error: string | null;
  next_retry_at: string | null;
  contact?: {
    id: string;
    name: string;
    phone: string | null;
  };
}

export interface MessageTemplate {
  id: string;
  name: string;
  message: string;
  media_url: string | null;
  media_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Campaign[];
    },
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as Campaign | null;
    },
    enabled: !!id,
  });
}

export function useCampaignContacts(campaignId: string) {
  return useQuery({
    queryKey: ['campaign-contacts', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_contacts')
        .select(`
          *,
          contact:contacts (id, name, phone)
        `)
        .eq('campaign_id', campaignId);

      if (error) throw error;
      return (data || []) as CampaignContact[];
    },
    enabled: !!campaignId,
  });
}

// Message Templates
export function useMessageTemplates() {
  return useQuery({
    queryKey: ['message-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as MessageTemplate[];
    },
  });
}

export function useCreateMessageTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      message: string;
      media_url?: string;
      media_type?: string;
      created_by?: string;
    }) => {
      const { data, error } = await supabase
        .from('message_templates')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success('Template salvo com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar template: ' + error.message);
    },
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      message: string;
      media_url?: string;
      media_type?: string;
      scheduled_at?: string;
      created_by?: string;
      message_variations?: string[];
      use_variations?: boolean;
      use_buttons?: boolean;
      buttons?: Array<{ id: string; text: string }>;
      min_interval?: number;
      max_interval?: number;
      template_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar campanha: ' + error.message);
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string;
      message?: string;
      media_url?: string;
      media_type?: string;
      status?: Campaign['status'];
      scheduled_at?: string;
      message_variations?: string[];
      use_variations?: boolean;
      use_buttons?: boolean;
      buttons?: Array<{ id: string; text: string }>;
      min_interval?: number;
      max_interval?: number;
    }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar campanha: ' + error.message);
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha excluída com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir campanha: ' + error.message);
    },
  });
}

export function useAddContactsToCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, contactIds }: { campaignId: string; contactIds: string[] }) => {
      const inserts = contactIds.map(contact_id => ({
        campaign_id: campaignId,
        contact_id,
      }));

      const { error } = await supabase
        .from('campaign_contacts')
        .insert(inserts);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-contacts', variables.campaignId] });
      toast.success('Contatos adicionados à campanha!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao adicionar contatos: ' + error.message);
    },
  });
}
