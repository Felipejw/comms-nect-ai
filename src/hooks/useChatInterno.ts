import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect, useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
  sender?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

export function useChatMessages(userId: string, otherUserId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !otherUserId) return;

    const channel = supabase
      .channel(`chat-${userId}-${otherUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as ChatMessage;
            if (
              (newMessage.sender_id === userId && newMessage.receiver_id === otherUserId) ||
              (newMessage.sender_id === otherUserId && newMessage.receiver_id === userId)
            ) {
              queryClient.setQueryData(
                ['chat-messages', userId, otherUserId],
                (old: ChatMessage[] | undefined) => {
                  if (!old) return [newMessage];
                  return [...old, newMessage];
                }
              );
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new as ChatMessage;
            queryClient.setQueryData(
              ['chat-messages', userId, otherUserId],
              (old: ChatMessage[] | undefined) => {
                if (!old) return old;
                return old.map(msg => msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg);
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, otherUserId, queryClient]);

  return useQuery({
    queryKey: ['chat-messages', userId, otherUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      
      let profileMap = new Map();
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, name, avatar_url')
          .in('user_id', senderIds);
        
        profiles?.forEach(p => profileMap.set(p.user_id, p));
      }
      
      return (data || []).map(msg => ({
        ...msg,
        sender: profileMap.get(msg.sender_id) || null,
      })) as ChatMessage[];
    },
    enabled: !!userId && !!otherUserId,
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      senderId,
      receiverId,
      content,
    }: {
      senderId: string;
      receiverId: string;
      content: string;
    }) => {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          sender_id: senderId,
          receiver_id: receiverId,
          content,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onError: (error: Error) => {
      toast.error('Erro ao enviar mensagem: ' + error.message);
    },
  });
}

export function useMarkMessagesAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      senderId,
    }: {
      userId: string;
      senderId: string;
    }) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('receiver_id', userId)
        .eq('sender_id', senderId)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.userId, variables.senderId] });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    },
  });
}

export function useUnreadMessageCounts(userId: string) {
  return useQuery({
    queryKey: ['unread-counts', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('sender_id')
        .eq('receiver_id', userId)
        .eq('is_read', false);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach(msg => {
        counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
      });

      return counts;
    },
    enabled: !!userId,
    refetchInterval: 10000,
  });
}

// Hook for read receipts - track when messages are read
export function useReadReceipts(messageIds: string[]) {
  return useQuery({
    queryKey: ['read-receipts', messageIds],
    queryFn: async () => {
      if (messageIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, is_read, receiver_id')
        .in('id', messageIds);

      if (error) throw error;

      const receipts: Record<string, { isRead: boolean; receiverId: string }> = {};
      data?.forEach(msg => {
        receipts[msg.id] = {
          isRead: msg.is_read || false,
          receiverId: msg.receiver_id,
        };
      });

      return receipts;
    },
    enabled: messageIds.length > 0,
    refetchInterval: 5000,
  });
}

// Hook for real-time presence in chat
export function useChatPresence(userId: string, userName: string) {
  const [onlineUsers, setOnlineUsers] = useState<Map<string, { name: string; lastSeen: string }>>(new Map());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('chat-presence')
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = new Map<string, { name: string; lastSeen: string }>();
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.user_id !== userId) {
              users.set(presence.user_id, {
                name: presence.user_name,
                lastSeen: new Date().toISOString(),
              });
            }
          });
        });
        
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            user_name: userName,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, userName]);

  return { onlineUsers };
}
