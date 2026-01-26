import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface SubscriptionPlanLimits {
  max_users?: number;
  max_connections?: number;
  max_contacts?: number;
  max_campaigns_month?: number;
  has_chatbot?: boolean;
  has_api_access?: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  limits: SubscriptionPlanLimits;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'yearly';
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
}

export interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  tenant_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: string | null;
  external_payment_id: string | null;
  paid_at: string | null;
  due_date: string;
  invoice_url: string | null;
  created_at: string;
}

// Fetch all active subscription plans
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });
}

// Fetch all plans (including inactive) for Super Admin
export function useAllSubscriptionPlans() {
  return useQuery({
    queryKey: ["subscription-plans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });
}

// Fetch current tenant's subscription
export function useMySubscription() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["my-subscription", profile?.tenant_id],
    queryFn: async () => {
      if (!profile?.tenant_id) return null;
      
      const { data, error } = await supabase
        .from("tenant_subscriptions")
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();

      if (error) throw error;
      return data as (TenantSubscription & { plan: SubscriptionPlan }) | null;
    },
    enabled: !!profile?.tenant_id,
  });
}

// Fetch subscription by tenant ID (for Super Admin)
export function useTenantSubscription(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-subscription", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      
      const { data, error } = await supabase
        .from("tenant_subscriptions")
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error) throw error;
      return data as (TenantSubscription & { plan: SubscriptionPlan }) | null;
    },
    enabled: !!tenantId,
  });
}

// Fetch payment history for current tenant
export function useSubscriptionPayments() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["subscription-payments", profile?.tenant_id],
    queryFn: async () => {
      if (!profile?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SubscriptionPayment[];
    },
    enabled: !!profile?.tenant_id,
  });
}

// Create subscription plan (Super Admin only)
export function useCreateSubscriptionPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (plan: Omit<SubscriptionPlan, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .insert([{
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          price_monthly: plan.price_monthly,
          price_yearly: plan.price_yearly,
          features: plan.features as Json,
          limits: plan.limits as Json,
          is_active: plan.is_active,
          display_order: plan.display_order,
        }])
        .select()
        .single();

      if (error) throw error;
      return data as SubscriptionPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plans-all"] });
      toast.success("Plano criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar plano: " + error.message);
    },
  });
}

// Update subscription plan (Super Admin only)
export function useUpdateSubscriptionPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SubscriptionPlan> & { id: string }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.slug !== undefined) updateData.slug = updates.slug;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.price_monthly !== undefined) updateData.price_monthly = updates.price_monthly;
      if (updates.price_yearly !== undefined) updateData.price_yearly = updates.price_yearly;
      if (updates.features !== undefined) updateData.features = updates.features;
      if (updates.limits !== undefined) updateData.limits = updates.limits;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
      if (updates.display_order !== undefined) updateData.display_order = updates.display_order;

      const { data, error } = await supabase
        .from("subscription_plans")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as SubscriptionPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plans-all"] });
      toast.success("Plano atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar plano: " + error.message);
    },
  });
}

// Delete subscription plan (Super Admin only)
export function useDeleteSubscriptionPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plans-all"] });
      toast.success("Plano excluído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir plano: " + error.message);
    },
  });
}

// Create or update tenant subscription (Super Admin)
export function useSetTenantSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tenantId,
      planId,
      billingCycle = 'monthly',
      status = 'active',
    }: {
      tenantId: string;
      planId: string;
      billingCycle?: 'monthly' | 'yearly';
      status?: string;
    }) => {
      const periodEnd = new Date();
      if (billingCycle === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Upsert subscription
      const { data: subscription, error: subError } = await supabase
        .from("tenant_subscriptions")
        .upsert({
          tenant_id: tenantId,
          plan_id: planId,
          billing_cycle: billingCycle,
          status,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString(),
        }, {
          onConflict: 'tenant_id'
        })
        .select()
        .single();

      if (subError) throw subError;

      // Update tenant subscription status
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({
          subscription_status: status,
          subscription_expires_at: periodEnd.toISOString(),
        })
        .eq("id", tenantId);

      if (tenantError) throw tenantError;

      return subscription;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-subscription", variables.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Assinatura atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar assinatura: " + error.message);
    },
  });
}

// Cancel subscription
export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (cancelAtPeriodEnd: boolean = true) => {
      if (!profile?.tenant_id) throw new Error("Tenant não encontrado");

      const updates: Record<string, unknown> = {
        cancel_at_period_end: cancelAtPeriodEnd,
      };

      if (!cancelAtPeriodEnd) {
        updates.status = 'cancelled';
        updates.cancelled_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("tenant_subscriptions")
        .update(updates)
        .eq("tenant_id", profile.tenant_id)
        .select()
        .single();

      if (error) throw error;

      // Update tenant status if cancelling immediately
      if (!cancelAtPeriodEnd) {
        await supabase
          .from("tenants")
          .update({ subscription_status: 'cancelled' })
          .eq("id", profile.tenant_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["my-tenant"] });
      toast.success("Assinatura cancelada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao cancelar assinatura: " + error.message);
    },
  });
}

// Get subscribers count per plan
export function usePlanSubscribersCount() {
  return useQuery({
    queryKey: ["plan-subscribers-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_subscriptions")
        .select("plan_id")
        .in("status", ["active", "past_due"]);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data.forEach((sub) => {
        counts[sub.plan_id] = (counts[sub.plan_id] || 0) + 1;
      });

      return counts;
    },
  });
}

// Helper function to check if a limit is exceeded
export function checkPlanLimit(
  limits: SubscriptionPlanLimits | undefined,
  key: keyof SubscriptionPlanLimits,
  currentValue: number
): boolean {
  if (!limits) return false;
  const limit = limits[key];
  
  // -1 means unlimited
  if (typeof limit === 'number' && limit >= 0) {
    return currentValue >= limit;
  }
  
  return false;
}

// Helper function to check if a feature is available
export function hasFeature(
  limits: SubscriptionPlanLimits | undefined,
  feature: 'has_chatbot' | 'has_api_access'
): boolean {
  if (!limits) return false;
  return limits[feature] === true;
}
