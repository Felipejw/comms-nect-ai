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
      const timeoutSignal = AbortSignal.timeout(15000);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get conversation counts using individual count queries (avoids 1000-row limit)
      const [newRes, inProgressRes, resolvedRes, archivedRes] = await Promise.all([
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'new').abortSignal(timeoutSignal),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'in_progress').abortSignal(timeoutSignal),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'resolved').abortSignal(timeoutSignal),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'archived').abortSignal(timeoutSignal),
      ]);

      const conversationsByStatus = {
        new: newRes.count || 0,
        in_progress: inProgressRes.count || 0,
        resolved: resolvedRes.count || 0,
        archived: archivedRes.count || 0,
      };

      const activeConversations = conversationsByStatus.new + conversationsByStatus.in_progress;

      // Get resolved today, total contacts, and new contacts today in parallel
      const [resolvedTodayRes, totalContactsRes, newContactsTodayRes] = await Promise.all([
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'resolved').gte('updated_at', todayISO).abortSignal(timeoutSignal),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).abortSignal(timeoutSignal),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).abortSignal(timeoutSignal),
      ]);

      const resolvedToday = resolvedTodayRes.count;
      const totalContacts = totalContactsRes.count;
      const newContactsToday = newContactsTodayRes.count;

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
