import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, CheckCircle, Clock, XCircle } from "lucide-react";
import { useAllSales, useUpdateSaleStatus, type SaleWithRelations } from "@/hooks/useSales";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusConfig = {
  pending: { label: "Pendente", icon: Clock, color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Pago", icon: CheckCircle, color: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelado", icon: XCircle, color: "bg-red-100 text-red-800" },
};

export function SuperAdminSales() {
  const { data: sales, isLoading } = useAllSales();
  const updateStatus = useUpdateSaleStatus();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredSales = sales?.filter((sale) => {
    const matchesSearch =
      sale.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
      sale.buyer_email?.toLowerCase().includes(search.toLowerCase()) ||
      sale.product?.name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || sale.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = (saleId: string, newStatus: string) => {
    updateStatus.mutate({
      id: saleId,
      status: newStatus as "pending" | "paid" | "cancelled",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas e Comissões</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por comprador ou produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Vendedor (Afiliado)</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales?.map((sale) => {
                const status = statusConfig[sale.status as keyof typeof statusConfig];
                const StatusIcon = status?.icon || Clock;

                return (
                  <TableRow key={sale.id}>
                    <TableCell>
                      {format(new Date(sale.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.product?.name || "Produto removido"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{sale.buyer_name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{sale.buyer_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {sale.seller_tenant?.name || "Venda direta"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      R$ {sale.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-green-600 font-medium">
                        R$ {sale.commission_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={status?.color || "bg-gray-100"}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status?.label || sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={sale.status}
                        onValueChange={(value) => handleStatusChange(sale.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Marcar como Pago</SelectItem>
                          <SelectItem value="cancelled">Cancelar</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredSales?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma venda encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}