import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ContactOnlineStatus {
  isOnline: boolean;
  lastSeen: string | null;
}

// Cache for contact online status to avoid redundant requests
const statusCache = new Map<string, { status: ContactOnlineStatus; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

export function useContactOnlineStatus(contactPhone: string | null | undefined) {
  const [status, setStatus] = useState<ContactOnlineStatus>({
    isOnline: false,
    lastSeen: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!contactPhone) return;

    // Check cache first
    const cached = statusCache.get(contactPhone);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setStatus(cached.status);
      return;
    }

    setIsLoading(true);
    try {
      // Try to fetch WhatsApp profile status via edge function
      const { data, error } = await supabase.functions.invoke('fetch-whatsapp-profile', {
        body: { phone: contactPhone },
      });

      if (!error && data?.status) {
        const newStatus = {
          isOnline: data.status === 'online',
          lastSeen: data.lastSeen || null,
        };
        setStatus(newStatus);
        statusCache.set(contactPhone, { status: newStatus, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('Error fetching contact status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [contactPhone]);

  useEffect(() => {
    fetchStatus();
    
    // Refresh status periodically
    const interval = setInterval(fetchStatus, 60000); // Every 60 seconds
    
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { ...status, isLoading, refetch: fetchStatus };
}

// Hook to track multiple contacts' online status
export function useContactsOnlineStatus(contactPhones: (string | null | undefined)[]) {
  const [statuses, setStatuses] = useState<Map<string, ContactOnlineStatus>>(new Map());

  useEffect(() => {
    const validPhones = contactPhones.filter((p): p is string => !!p);
    
    if (validPhones.length === 0) return;

    const fetchAllStatuses = async () => {
      const newStatuses = new Map<string, ContactOnlineStatus>();
      
      for (const phone of validPhones) {
        // Check cache
        const cached = statusCache.get(phone);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          newStatuses.set(phone, cached.status);
          continue;
        }

        try {
          const { data, error } = await supabase.functions.invoke('fetch-whatsapp-profile', {
            body: { phone },
          });

          if (!error && data) {
            const status = {
              isOnline: data.status === 'online',
              lastSeen: data.lastSeen || null,
            };
            newStatuses.set(phone, status);
            statusCache.set(phone, { status, timestamp: Date.now() });
          }
        } catch (err) {
          // Silently fail for individual contacts
        }
      }

      setStatuses(newStatuses);
    };

    fetchAllStatuses();
    
    // Refresh periodically
    const interval = setInterval(fetchAllStatuses, 120000); // Every 2 minutes
    
    return () => clearInterval(interval);
  }, [JSON.stringify(contactPhones)]);

  return statuses;
}
