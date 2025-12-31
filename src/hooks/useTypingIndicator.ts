import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TypingUser {
  id: string;
  name: string;
}

export function useTypingIndicator(conversationId: string, userId: string, userName: string) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingRef = useRef<number>(0);

  // Broadcast typing status
  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!conversationId || !userId) return;

    const now = Date.now();
    // Throttle: only send if last typing was more than 2 seconds ago
    if (isTyping && now - lastTypingRef.current < 2000) return;
    lastTypingRef.current = now;

    const channel = supabase.channel(`typing:${conversationId}`);
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, userName, isTyping }
    });
  }, [conversationId, userId, userName]);

  // Handle typing with auto-stop after inactivity
  const handleTyping = useCallback(() => {
    sendTypingStatus(true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 3000);
  }, [sendTypingStatus]);

  // Stop typing immediately
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTypingStatus(false);
  }, [sendTypingStatus]);

  // Listen for typing events
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase.channel(`typing:${conversationId}`);

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.userId === userId) return;

        const { userId: typingUserId, userName: typingUserName, isTyping } = payload;

        setTypingUsers(prev => {
          if (isTyping) {
            // Add user if not already in list
            if (!prev.some(u => u.id === typingUserId)) {
              return [...prev, { id: typingUserId, name: typingUserName }];
            }
            return prev;
          } else {
            // Remove user from list
            return prev.filter(u => u.id !== typingUserId);
          }
        });

        // Auto-remove user after 5 seconds (in case stop event was lost)
        if (isTyping) {
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.id !== typingUserId));
          }, 5000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    typingUsers,
    handleTyping,
    stopTyping
  };
}
