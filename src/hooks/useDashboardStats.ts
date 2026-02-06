import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardStats {
  activeConversations: number;
  totalContacts: number;
  resolvedToday: number;
  newContactsToday: number;
  conversationsByStatus: {
    new: number;
    in_progress: number;
    resolved: number;
    archived: number;
  };
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get conversation counts
      const { data: conversations } = await supabase
        .from('conversations')
        .select('status');

      const conversationsByStatus = {
        new: 0,
        in_progress: 0,
        resolved: 0,
        archived: 0,
      };

      conversations?.forEach(c => {
        if (c.status in conversationsByStatus) {
          conversationsByStatus[c.status as keyof typeof conversationsByStatus]++;
        }
      });

      const activeConversations = conversationsByStatus.new + conversationsByStatus.in_progress;

      // Get resolved today
      const { count: resolvedToday } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .gte('updated_at', todayISO);

      // Get total contacts
      const { count: totalContacts } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });

      // Get new contacts today
      const { count: newContactsToday } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO);

      return {
        activeConversations,
        totalContacts: totalContacts || 0,
        resolvedToday: resolvedToday || 0,
        newContactsToday: newContactsToday || 0,
        conversationsByStatus,
      } as DashboardStats;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useRecentConversations(limit = 5) {
  return useQuery({
    queryKey: ['recent-conversations', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts (id, name, email, phone, avatar_url, whatsapp_lid, name_source),
          assignee:profiles!conversations_assigned_to_fkey (id, name, avatar_url)
        `)
        .order('last_message_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

export function useTeamPerformance() {
  return useQuery({
    queryKey: ['team-performance'],
    queryFn: async () => {
      // Get all users with their conversation counts
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url');

      if (!profiles) return [];

      // Get conversation counts per user
      const { data: conversations } = await supabase
        .from('conversations')
        .select('assigned_to, status');

      const userStats = new Map<string, { resolved: number; active: number }>();

      conversations?.forEach(c => {
        if (!c.assigned_to) return;
        
        const stats = userStats.get(c.assigned_to) || { resolved: 0, active: 0 };
        
        if (c.status === 'resolved') {
          stats.resolved++;
        } else if (c.status === 'in_progress' || c.status === 'new') {
          stats.active++;
        }
        
        userStats.set(c.assigned_to, stats);
      });

      return profiles.map(profile => ({
        ...profile,
        resolved: userStats.get(profile.user_id)?.resolved || 0,
        active: userStats.get(profile.user_id)?.active || 0,
      }));
    },
  });
}
