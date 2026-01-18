import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Sale {
  id: string;
  product_id: string | null;
  seller_tenant_id: string | null;
  buyer_tenant_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  total_amount: number;
  commission_amount: number;
  status: "pending" | "paid" | "cancelled";
  paid_at: string | null;
  created_at: string;
}

export interface SaleWithRelations extends Sale {
  product?: {
    name: string;
  };
  seller_tenant?: {
    name: string;
  };
  buyer_tenant?: {
    name: string;
  };
}

// Fetch all sales (Super Admin only)
export function useAllSales() {
  return useQuery({
    queryKey: ["sales", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          product:products(name),
          seller_tenant:tenants!sales_seller_tenant_id_fkey(name),
          buyer_tenant:tenants!sales_buyer_tenant_id_fkey(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SaleWithRelations[];
    },
  });
}

// Fetch sales for current tenant (seller)
export function useMySales() {
  const { tenant } = useAuth();

  return useQuery({
    queryKey: ["sales", "my", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          product:products(name),
          buyer_tenant:tenants!sales_buyer_tenant_id_fkey(name)
        `)
        .eq("seller_tenant_id", tenant.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SaleWithRelations[];
    },
    enabled: !!tenant?.id,
  });
}

// Get sales stats
export function useSalesStats() {
  const { tenant, isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: ["sales-stats", isSuperAdmin ? "all" : tenant?.id],
    queryFn: async () => {
      let query = supabase.from("sales").select("*");

      if (!isSuperAdmin && tenant?.id) {
        query = query.eq("seller_tenant_id", tenant.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const sales = data as Sale[];
      
      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalCommissions = sales.reduce((sum, s) => sum + Number(s.commission_amount), 0);
      const pendingCommissions = sales
        .filter(s => s.status === "pending")
        .reduce((sum, s) => sum + Number(s.commission_amount), 0);
      const paidCommissions = sales
        .filter(s => s.status === "paid")
        .reduce((sum, s) => sum + Number(s.commission_amount), 0);

      return {
        totalSales,
        totalRevenue,
        totalCommissions,
        pendingCommissions,
        paidCommissions,
      };
    },
    enabled: isSuperAdmin || !!tenant?.id,
  });
}

// Create new sale
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sale: Omit<Sale, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("sales")
        .insert(sale)
        .select()
        .single();

      if (error) throw error;
      return data as Sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sales-stats"] });
      toast.success("Venda registrada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao registrar venda: " + error.message);
    },
  });
}

// Update sale status (Super Admin only)
export function useUpdateSaleStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Sale["status"] }) => {
      const updates: Partial<Sale> = { status };
      if (status === "paid") {
        updates.paid_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("sales")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sales-stats"] });
      toast.success("Status da venda atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar venda: " + error.message);
    },
  });
}