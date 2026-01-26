import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Package, DollarSign, CreditCard } from "lucide-react";
import { SuperAdminTenants } from "@/components/superadmin/SuperAdminTenants";
import { SuperAdminProducts } from "@/components/superadmin/SuperAdminProducts";
import { SuperAdminSales } from "@/components/superadmin/SuperAdminSales";
import { SuperAdminStats } from "@/components/superadmin/SuperAdminStats";
import { SuperAdminPlans } from "@/components/superadmin/SuperAdminPlans";

export default function SuperAdmin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Super Admin</h1>
        <p className="text-muted-foreground">
          Gerencie todos os clientes, produtos e vendas da plataforma
        </p>
      </div>

      <SuperAdminStats />

      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Planos
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Produtos
          </TabsTrigger>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Vendas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <SuperAdminTenants />
        </TabsContent>

        <TabsContent value="plans">
          <SuperAdminPlans />
        </TabsContent>

        <TabsContent value="products">
          <SuperAdminProducts />
        </TabsContent>

        <TabsContent value="sales">
          <SuperAdminSales />
        </TabsContent>
      </Tabs>
    </div>
  );
}
