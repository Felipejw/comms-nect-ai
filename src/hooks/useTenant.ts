import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  owner_user_id: string;
  plan: string;
  is_active: boolean;
  affiliate_code: string;
  referred_by: string | null;
  commission_rate: number;
  created_at: string;
  updated_at: string;
}

export interface TenantSetting {
  id: string;
  tenant_id: string;
  key: string;
  value: string;
  category: string;
}

// Fetch all tenants (Super Admin only)
export function useTenants() {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Tenant[];
    },
  });
}

// Fetch single tenant by ID
export function useTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    enabled: !!tenantId,
  });
}

// Fetch current user's tenant
export function useMyTenant() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["my-tenant", profile?.tenant_id],
    queryFn: async () => {
      if (!profile?.tenant_id) return null;
      
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", profile.tenant_id)
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    enabled: !!profile?.tenant_id,
  });
}

// Create new tenant
export function useCreateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tenant: Omit<Tenant, "id" | "created_at" | "updated_at" | "affiliate_code">) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert(tenant)
        .select()
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar tenant: " + error.message);
    },
  });
}

// Update tenant
export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["tenant", data.id] });
      queryClient.invalidateQueries({ queryKey: ["my-tenant"] });
      toast.success("Tenant atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar tenant: " + error.message);
    },
  });
}

// Toggle tenant active status
export function useToggleTenantStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update({ is_active })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success(data.is_active ? "Tenant ativado!" : "Tenant desativado!");
    },
    onError: (error) => {
      toast.error("Erro ao alterar status: " + error.message);
    },
  });
}

// Fetch tenant settings
export function useTenantSettings(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-settings", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId);

      if (error) throw error;
      return data as TenantSetting[];
    },
    enabled: !!tenantId,
  });
}

// Update or create tenant setting
export function useUpsertTenantSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tenant_id, key, value, category = "branding" }: { 
      tenant_id: string; 
      key: string; 
      value: string;
      category?: string;
    }) => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .upsert(
          { tenant_id, key, value, category },
          { onConflict: "tenant_id,key" }
        )
        .select()
        .single();

      if (error) throw error;
      return data as TenantSetting;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings", data.tenant_id] });
    },
    onError: (error: any) => {
      console.error("Tenant setting upsert error:", error);
      toast.error("Erro ao salvar configuração: " + (error?.message || 'desconhecido'));
    },
  });
}