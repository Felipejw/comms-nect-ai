import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Package, DollarSign, TrendingUp } from "lucide-react";
import { useTenants } from "@/hooks/useTenant";
import { useProducts } from "@/hooks/useProducts";
import { useSalesStats } from "@/hooks/useSales";
import { Skeleton } from "@/components/ui/skeleton";

export function SuperAdminStats() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: salesStats, isLoading: loadingSales } = useSalesStats();

  const stats = [
    {
      title: "Clientes Ativos",
      value: loadingTenants ? null : tenants?.filter(t => t.is_active).length || 0,
      icon: Building2,
      description: `${tenants?.length || 0} total`,
      color: "text-blue-500",
    },
    {
      title: "Produtos",
      value: loadingProducts ? null : products?.filter(p => p.is_active).length || 0,
      icon: Package,
      description: "ativos",
      color: "text-green-500",
    },
    {
      title: "Receita Total",
      value: loadingSales ? null : `R$ ${(salesStats?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      description: `${salesStats?.totalSales || 0} vendas`,
      color: "text-yellow-500",
    },
    {
      title: "Comissões Pendentes",
      value: loadingSales ? null : `R$ ${(salesStats?.pendingCommissions || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      description: "a pagar",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            {stat.value === null ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}