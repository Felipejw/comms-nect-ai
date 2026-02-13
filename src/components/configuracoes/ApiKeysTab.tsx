import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "@/lib/adminWrite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { Plus, Copy, Trash2, Key, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "tf_";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PERMISSION_OPTIONS = [
  { id: "read", label: "Leitura", description: "Consultar contatos, conversas, mensagens e conexões" },
  { id: "write", label: "Escrita", description: "Criar e editar contatos" },
  { id: "send", label: "Enviar Mensagens", description: "Enviar mensagens via WhatsApp" },
];

export function ApiKeysTab() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(["read"]);
  const [newKeyExpiry, setNewKeyExpiry] = useState("");

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const key = generateApiKey();
      const hash = await sha256(key);
      const prefix = key.substring(0, 7);

      const { data: { user } } = await supabase.auth.getUser();

      await adminWrite({
        table: "api_keys",
        operation: "insert",
        data: {
          name: newKeyName,
          key_hash: hash,
          key_prefix: prefix,
          permissions: newKeyPermissions,
          created_by: user?.id,
          expires_at: newKeyExpiry || null,
        },
      });

      return key;
    },
    onSuccess: (key) => {
      setGeneratedKey(key);
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      setNewKeyName("");
      setNewKeyPermissions(["read"]);
      setNewKeyExpiry("");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Chave API criada com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao criar chave: " + err.message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await adminWrite({
        table: "api_keys",
        operation: "update",
        data: { is_active: false },
        filters: { id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Chave revogada!");
    },
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePermission = (perm: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" /> Chaves de API
            </CardTitle>
            <CardDescription>
              Gerencie as chaves para acesso externo à API do TalkFlow
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nova Chave
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : apiKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nenhuma chave API criada ainda. Crie uma para começar a integrar sistemas externos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Prefixo</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Último Uso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{key.key_prefix}...</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(key.permissions as string[] || []).map((p: string) => (
                          <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.last_used_at
                        ? format(new Date(key.last_used_at), "dd/MM/yy HH:mm", { locale: ptBR })
                        : "Nunca"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? "default" : "destructive"}>
                        {key.is_active ? "Ativa" : "Revogada"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {key.is_active && (
                        <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(key.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Chave API</DialogTitle>
            <DialogDescription>Configure as permissões da nova chave.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Chave</Label>
              <Input placeholder="Ex: Integração CRM" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            </div>
            <div>
              <Label>Permissões</Label>
              <div className="space-y-3 mt-2">
                {PERMISSION_OPTIONS.map((perm) => (
                  <div key={perm.id} className="flex items-start gap-3">
                    <Checkbox
                      checked={newKeyPermissions.includes(perm.id)}
                      onCheckedChange={() => togglePermission(perm.id)}
                    />
                    <div>
                      <p className="text-sm font-medium">{perm.label}</p>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>Expiração (opcional)</Label>
              <Input type="date" value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!newKeyName || createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Chave"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Key Display Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave API Criada!</DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              ⚠️ Copie a chave agora! Ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <code className="text-sm break-all select-all">{generatedKey}</code>
            </div>
            <Button className="w-full" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copiada!" : "Copiar Chave"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
