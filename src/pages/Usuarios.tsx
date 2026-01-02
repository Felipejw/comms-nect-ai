import { useState } from "react";
import { Plus, Search, Filter, MoreHorizontal, Shield, Edit, Trash2, Key, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUsers, useUpdateUserRole } from "@/hooks/useUsers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const roleConfig = {
  admin: { label: "Administrador", className: "bg-destructive/10 text-destructive" },
  manager: { label: "Gestor", className: "bg-primary/10 text-primary" },
  operator: { label: "Operador", className: "bg-success/10 text-success" },
};

export default function Usuarios() {
  const { data: users = [], isLoading, refetch } = useUsers();
  const updateRole = useUpdateUserRole();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager" | "operator">("operator");

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newEmail.trim(),
          password: newPassword,
          name: newName.trim(),
          role: newRole,
        },
      });

      if (error) throw error;

      toast.success("Atendente criado com sucesso!");
      setIsDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("operator");
      refetch();
    } catch (error) {
      toast.error("Erro ao criar atendente: " + (error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "admin" | "manager" | "operator") => {
    await updateRole.mutateAsync({ userId, role: newRole });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatLastSeen = (dateString: string | null) => {
    if (!dateString) return "Nunca";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 5) return "Online agora";
    if (diffMins < 60) return `Há ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Há ${diffHours}h`;
    return format(date, "dd/MM HH:mm", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Atendentes</h2>
          <p className="text-muted-foreground">Gerencie atendentes e permissões do sistema</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Atendente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Atendente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input 
                  placeholder="Nome completo" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input 
                  type="email" 
                  placeholder="email@empresa.com" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Nível</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Gestor</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} disabled={isCreating}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Atendente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-stats">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Administradores</p>
              <p className="text-2xl font-bold">{users.filter(u => u.role === "admin").length}</p>
            </div>
          </div>
        </div>
        <div className="card-stats">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gestores</p>
              <p className="text-2xl font-bold">{users.filter(u => u.role === "manager").length}</p>
            </div>
          </div>
        </div>
        <div className="card-stats">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Shield className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Operadores</p>
              <p className="text-2xl font-bold">{users.filter(u => u.role === "operator").length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar atendentes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" />
          Filtrar
        </Button>
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Atendente</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última Atividade</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum atendente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {user.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${
                            user.is_online ? "bg-green-500" : "bg-muted"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role || "operator"}
                      onValueChange={(v) => handleRoleChange(user.id, v as "admin" | "manager" | "operator")}
                    >
                      <SelectTrigger className="w-[140px]">
                        <Badge className={roleConfig[user.role as keyof typeof roleConfig]?.className || roleConfig.operator.className}>
                          {roleConfig[user.role as keyof typeof roleConfig]?.label || "Operador"}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="manager">Gestor</SelectItem>
                        <SelectItem value="operator">Operador</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        user.is_online
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {user.is_online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatLastSeen(user.last_seen)}</TableCell>
                  <TableCell>{formatDate(user.created_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Key className="w-4 h-4 mr-2" />
                          Redefinir senha
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
