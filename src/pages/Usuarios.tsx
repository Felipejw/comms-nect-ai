import { useState } from "react";
import { Plus, Search, Filter, MoreHorizontal, Shield, Edit, Trash2, Key, Loader2, Lock, Copy, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { PermissionsModal } from "@/components/usuarios/PermissionsModal";
import { PermissionsPanel, PermissionState, getDefaultPermissions } from "@/components/usuarios/PermissionsPanel";

const roleConfig = {
  admin: { label: "Administrador", className: "bg-destructive/10 text-destructive" },
  atendente: { label: "Atendente", className: "bg-primary/10 text-primary" },
};

export default function Usuarios() {
  const { data: users = [], isLoading, refetch } = useUsers();
  const updateRole = useUpdateUserRole();
  const { isAdmin } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Permissions modal state
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  
  // Reset password modal state
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  
  // Edit user state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  
  // Delete user state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "atendente">("atendente");
  const [newPermissions, setNewPermissions] = useState<Record<string, PermissionState>>(getDefaultPermissions());

  const filteredUsers = users.filter((u) => {
    if (searchQuery.startsWith("role:")) {
      const roleFilter = searchQuery.replace("role:", "");
      return getNormalizedRole(u.role) === roleFilter;
    }
    return u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newUserPassword.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setIsCreating(true);
    try {
      // Convert permissions to array format for API
      const permissionsArray = newRole === "atendente" 
        ? Object.entries(newPermissions).map(([module, perm]) => ({
            module,
            can_view: perm.can_view,
            can_edit: perm.can_edit,
          }))
        : [];

      const { error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newEmail.trim(),
          password: newUserPassword,
          name: newName.trim(),
          role: newRole,
          permissions: permissionsArray,
        },
      });

      if (error) throw error;

      toast.success("Atendente criado com sucesso!");
      setIsDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewUserPassword("");
      setNewRole("atendente");
      setNewPermissions(getDefaultPermissions());
      refetch();
    } catch (error) {
      toast.error("Erro ao criar atendente: " + (error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "admin" | "atendente") => {
    await updateRole.mutateAsync({ userId, role: newRole });
  };

  const handleOpenEdit = (user: { id: string; name: string; email: string }) => {
    setEditingUser(user);
    setEditName(user.name);
    setIsEditOpen(true);
  };

  const handleEditUser = async () => {
    if (!editingUser || !editName.trim()) return;
    setIsEditing(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: editName.trim() })
        .eq("user_id", editingUser.id);
      if (error) throw error;
      toast.success("Atendente atualizado com sucesso!");
      setIsEditOpen(false);
      setEditingUser(null);
      refetch();
    } catch (error) {
      toast.error("Erro ao atualizar: " + (error as Error).message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleOpenDelete = (user: { id: string; name: string }) => {
    setDeletingUser(user);
    setIsDeleteOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-user", {
        body: { userId: deletingUser.id },
      });
      if (error) throw error;
      toast.success("Atendente excluído com sucesso!");
      setIsDeleteOpen(false);
      setDeletingUser(null);
      refetch();
    } catch (error) {
      toast.error("Erro ao excluir: " + (error as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenPermissions = (userId: string, userName: string) => {
    setSelectedUser({ id: userId, name: userName });
    setPermissionsOpen(true);
  };

  const handleOpenResetPassword = (userId: string, userName: string) => {
    setResetPasswordUser({ id: userId, name: userName });
    setNewPassword("");
    setGeneratedPassword("");
    setPasswordCopied(false);
    setIsResetPasswordOpen(true);
  };

  const handleResetPassword = async (generateRandom: boolean) => {
    if (!resetPasswordUser) return;
    
    if (!generateRandom && newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setIsResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: {
          userId: resetPasswordUser.id,
          newPassword: generateRandom ? undefined : newPassword,
          generateRandom,
        },
      });

      if (error) throw error;

      if (data?.newPassword) {
        setGeneratedPassword(data.newPassword);
        toast.success("Senha gerada com sucesso! Copie e envie ao usuário.");
      } else {
        toast.success("Senha redefinida com sucesso!");
        setIsResetPasswordOpen(false);
      }
    } catch (error) {
      toast.error("Erro ao redefinir senha: " + (error as Error).message);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(generatedPassword);
    setPasswordCopied(true);
    toast.success("Senha copiada!");
    setTimeout(() => setPasswordCopied(false), 2000);
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

  // Normalize role for display (handle old 'manager' and 'operator' roles)
  const getNormalizedRole = (role: string | undefined): "admin" | "atendente" => {
    if (role === "admin") return "admin";
    return "atendente";
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
          <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Adicionar Atendente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 flex-1 overflow-y-auto">
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
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Nível</Label>
                <Select value={newRole} onValueChange={(v) => {
                  setNewRole(v as "admin" | "atendente");
                  if (v === "admin") {
                    setNewPermissions(getDefaultPermissions());
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="atendente">Atendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {newRole === "atendente" && (
                <div className="space-y-2">
                  <Label>Permissões</Label>
                  <PermissionsPanel 
                    permissions={newPermissions}
                    onPermissionsChange={setNewPermissions}
                  />
                </div>
              )}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <p className="text-sm text-muted-foreground">Atendentes</p>
              <p className="text-2xl font-bold">{users.filter(u => u.role !== "admin").length}</p>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtrar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSearchQuery("")}>
              Todos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSearchQuery("role:admin")}>
              Administradores
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSearchQuery("role:atendente")}>
              Atendentes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="table-container overflow-x-auto">
        <Table className="min-w-[700px]">
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
              filteredUsers.map((user) => {
                const normalizedRole = getNormalizedRole(user.role);
                return (
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
                      {isAdmin ? (
                        <Select
                          value={normalizedRole}
                          onValueChange={(v) => handleRoleChange(user.id, v as "admin" | "atendente")}
                        >
                          <SelectTrigger className="w-[140px]">
                            <Badge className={roleConfig[normalizedRole]?.className}>
                              {roleConfig[normalizedRole]?.label}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="atendente">Atendente</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={roleConfig[normalizedRole]?.className}>
                          {roleConfig[normalizedRole]?.label}
                        </Badge>
                      )}
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
                          {isAdmin && normalizedRole === "atendente" && (
                            <DropdownMenuItem onClick={() => handleOpenPermissions(user.id, user.name)}>
                              <Lock className="w-4 h-4 mr-2" />
                              Gerenciar Permissões
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleOpenEdit({ id: user.id, name: user.name, email: user.email })}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenResetPassword(user.id, user.name)}>
                            <Key className="w-4 h-4 mr-2" />
                            Redefinir senha
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleOpenDelete({ id: user.id, name: user.name })}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Permissions Modal */}
      {selectedUser && (
        <PermissionsModal
          open={permissionsOpen}
          onOpenChange={setPermissionsOpen}
          userId={selectedUser.id}
          userName={selectedUser.name}
        />
      )}

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Redefinir Senha
            </DialogTitle>
            <DialogDescription>
              Redefina a senha de {resetPasswordUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {generatedPassword ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <Label className="text-sm text-muted-foreground">Nova senha gerada:</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background rounded border font-mono text-sm">
                      {generatedPassword}
                    </code>
                    <Button variant="outline" size="icon" onClick={copyPassword}>
                      {passwordCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copie e envie esta senha ao usuário. Ela não será exibida novamente.
                  </p>
                </div>
                <Button className="w-full" onClick={() => setIsResetPasswordOpen(false)}>
                  Fechar
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Nova Senha</Label>
                  <Input 
                    type="password" 
                    placeholder="Digite a nova senha (mínimo 6 caracteres)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1" 
                    onClick={() => handleResetPassword(false)}
                    disabled={isResettingPassword || newPassword.length < 6}
                  >
                    {isResettingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Definir Senha
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => handleResetPassword(true)}
                    disabled={isResettingPassword}
                  >
                    {isResettingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Gerar Aleatória
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Atendente</DialogTitle>
            <DialogDescription>Altere o nome do atendente {editingUser?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome completo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditUser} disabled={isEditing || !editName.trim()}>
              {isEditing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atendente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deletingUser?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
