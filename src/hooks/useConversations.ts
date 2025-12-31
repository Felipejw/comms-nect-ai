import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_type: 'agent' | 'contact' | 'bot';
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'document' | 'video';
  media_url: string | null;
  is_read: boolean;
  delivery_status: 'sent' | 'delivered' | 'read' | null;
  created_at: string;
}

export interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  assigned_to: string | null;
  queue_id: string | null;
  status: 'new' | 'in_progress' | 'resolved' | 'archived';
  subject: string | null;
  channel: string;
  priority: number;
  unread_count: number;
  last_message_at: string;
  created_at: string;
  is_bot_active: boolean;
  contact?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  assignee?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  tags?: ConversationTag[];
}

export function useConversations(status?: 'new' | 'in_progress' | 'resolved' | 'archived') {
  const queryClient = useQueryClient();

  // Subscribe to realtime updates for conversations
  useEffect(() => {
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          // Invalidate queries to refetch with updated data
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, status]);

  return useQuery({
    queryKey: ['conversations', status],
    queryFn: async () => {
      let query = supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts (id, name, email, phone, avatar_url)
        `)
        .order('last_message_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch assignee profiles separately
      const assignedToIds = [...new Set((data || []).map(c => c.assigned_to).filter(Boolean))];
      
      let assigneeMap = new Map();
      if (assignedToIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, name, avatar_url')
          .in('user_id', assignedToIds);
        
        profiles?.forEach(p => assigneeMap.set(p.user_id, p));
      }
      
      // Fetch conversation tags
      const conversationIds = (data || []).map(c => c.id);
      let tagsMap = new Map<string, ConversationTag[]>();
      
      if (conversationIds.length > 0) {
        const { data: convTags } = await supabase
          .from('conversation_tags')
          .select(`
            conversation_id,
            tag:tags(id, name, color)
          `)
          .in('conversation_id', conversationIds);
        
        convTags?.forEach(ct => {
          const tag = ct.tag as unknown as { id: string; name: string; color: string };
          if (tag) {
            const existing = tagsMap.get(ct.conversation_id) || [];
            existing.push({ id: tag.id, name: tag.name, color: tag.color });
            tagsMap.set(ct.conversation_id, existing);
          }
        });
      }
      
      return (data || []).map(conv => ({
        ...conv,
        assignee: conv.assigned_to ? assigneeMap.get(conv.assigned_to) || null : null,
        tags: tagsMap.get(conv.id) || [],
      })) as Conversation[];
    },
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversations', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts (id, name, email, phone, avatar_url)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      
      // Fetch assignee profile separately
      let assignee = null;
      if (data.assigned_to) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, user_id, name, avatar_url')
          .eq('user_id', data.assigned_to)
          .maybeSingle();
        
        assignee = profile;
      }
      
      return {
        ...data,
        assignee,
      } as Conversation;
    },
    enabled: !!id,
  });
}

export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          queryClient.setQueryData(['messages', conversationId], (old: Message[] | undefined) => {
            if (!old) return [payload.new as Message];
            return [...old, payload.new as Message];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      senderId,
      senderType = 'agent',
      sendViaWhatsApp = false,
      messageType = 'text',
      mediaUrl,
    }: {
      conversationId: string;
      content: string;
      senderId: string;
      senderType?: 'agent' | 'contact' | 'bot';
      sendViaWhatsApp?: boolean;
      messageType?: 'text' | 'image' | 'audio' | 'document' | 'video';
      mediaUrl?: string;
    }) => {
      // If sending via WhatsApp, use the edge function
      if (sendViaWhatsApp) {
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
          body: { conversationId, content, messageType, mediaUrl },
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);
        return data.message;
      }

      // Otherwise, just save to database (for internal messages)
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content,
          sender_id: senderId,
          sender_type: senderType,
          message_type: messageType,
          media_url: mediaUrl || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao enviar mensagem: ' + error.message);
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      status?: Conversation['status'];
      assigned_to?: string | null;
      queue_id?: string | null;
      is_bot_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('conversations')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa atualizada!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar conversa: ' + error.message);
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      // First delete all messages in the conversation
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      if (messagesError) throw messagesError;

      // Then delete the conversation
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa excluída!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir conversa: ' + error.message);
    },
  });
}

export function useMarkConversationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      // Mark all unread messages as read
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('is_read', false);

      // Reset unread count
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      assignedTo,
      queueId,
    }: {
      contactId: string;
      assignedTo?: string;
      queueId?: string;
    }) => {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          assigned_to: assignedTo,
          queue_id: queueId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa criada!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar conversa: ' + error.message);
    },
  });
}
