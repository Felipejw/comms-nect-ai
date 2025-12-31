import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { Campaign } from './useCampaigns';

export interface CampaignMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  deliveryRate: number;
  readRate: number;
  campaignsByStatus: {
    draft: number;
    active: number;
    paused: number;
    completed: number;
  };
  recentCampaigns: Campaign[];
  hourlyStats: { hour: string; sent: number; delivered: number; read: number }[];
}

export function useCampaignMetrics() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['campaign-metrics'],
    queryFn: async (): Promise<CampaignMetrics> => {
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const campaignList = (campaigns || []) as Campaign[];

      // Calculate totals
      const totalSent = campaignList.reduce((sum, c) => sum + (c.sent_count || 0), 0);
      const totalDelivered = campaignList.reduce((sum, c) => sum + (c.delivered_count || 0), 0);
      const totalRead = campaignList.reduce((sum, c) => sum + (c.read_count || 0), 0);
      const totalFailed = campaignList.reduce((sum, c) => sum + (c.failed_count || 0), 0);

      // Calculate rates
      const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
      const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;

      // Count by status
      const campaignsByStatus = {
        draft: campaignList.filter(c => c.status === 'draft').length,
        active: campaignList.filter(c => c.status === 'active').length,
        paused: campaignList.filter(c => c.status === 'paused').length,
        completed: campaignList.filter(c => c.status === 'completed').length,
      };

      // Get hourly stats (simulated based on campaigns created)
      const hourlyStats = generateHourlyStats(campaignList);

      return {
        totalCampaigns: campaignList.length,
        activeCampaigns: campaignsByStatus.active,
        totalSent,
        totalDelivered,
        totalRead,
        totalFailed,
        deliveryRate,
        readRate,
        campaignsByStatus,
        recentCampaigns: campaignList.slice(0, 5),
        hourlyStats,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Real-time subscription for campaign updates
  useEffect(() => {
    const channel = supabase
      .channel('campaign-metrics-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaigns',
        },
        () => {
          // Invalidate and refetch metrics when campaigns change
          queryClient.invalidateQueries({ queryKey: ['campaign-metrics'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_contacts',
        },
        () => {
          // Invalidate and refetch metrics when campaign contacts change
          queryClient.invalidateQueries({ queryKey: ['campaign-metrics'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

function generateHourlyStats(campaigns: Campaign[]) {
  const hours = [];
  const now = new Date();
  
  for (let i = 23; i >= 0; i--) {
    const hour = new Date(now);
    hour.setHours(now.getHours() - i, 0, 0, 0);
    const hourStr = hour.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Calculate metrics for this hour (simplified - in production you'd have actual time-based data)
    const hourFactor = (24 - i) / 24;
    hours.push({
      hour: hourStr,
      sent: Math.round(campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0) * hourFactor * 0.1),
      delivered: Math.round(campaigns.reduce((sum, c) => sum + (c.delivered_count || 0), 0) * hourFactor * 0.1),
      read: Math.round(campaigns.reduce((sum, c) => sum + (c.read_count || 0), 0) * hourFactor * 0.1),
    });
  }
  
  return hours;
}

export function useCampaignContactsRealtime(campaignId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!campaignId) return;

    const channel = supabase
      .channel(`campaign-contacts-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_contacts',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['campaign-contacts', campaignId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, queryClient]);
}