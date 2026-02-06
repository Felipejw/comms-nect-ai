import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePresence() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const markOnline = async (userId: string) => {
      await supabase
        .from('profiles')
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq('user_id', userId);
    };

    const markOffline = async (userId: string) => {
      await supabase
        .from('profiles')
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq('user_id', userId);
    };

    const heartbeat = async (userId: string) => {
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('user_id', userId);
    };

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      userIdRef.current = user.id;
      await markOnline(user.id);

      // Heartbeat every 60 seconds
      intervalRef.current = setInterval(() => {
        heartbeat(user.id);
      }, 60_000);
    };

    const handleBeforeUnload = () => {
      if (userIdRef.current) {
        // Use sendBeacon for reliability on page close
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userIdRef.current}`;
        const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
        navigator.sendBeacon(
          url,
          new Blob([body], { type: 'application/json' })
        );
      }
    };

    setup();
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (userIdRef.current) {
        markOffline(userIdRef.current);
      }
    };
  }, []);
}
