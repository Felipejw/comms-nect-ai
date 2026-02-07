import { useState, useRef } from "react";
import { Search, Plus, Filter, MoreHorizontal, MessageSquare, Edit, Trash2, Loader2, Eye, Phone, Mail, Building, Tag, FileText, Upload, FileSpreadsheet, RefreshCw, Info, CheckSquare, Square, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuSeparator,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useContacts, useCreateContact, useDeleteContact, useUpdateContact, Contact } from "@/hooks/useContacts";
import { useSyncContacts, hasLidIssue, hasPlaceholderName } from "@/hooks/useSyncContacts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { ReadOnlyBadge } from "@/components/ui/ReadOnlyBadge";

// Helper to check if phone is a LID (long identifier, not a real phone)
const isLidPhone = (phone: string | null | undefined): boolean => {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  // LIDs typically have more than 15 digits
  return cleaned.length > 15;
};

// Clean phone - remove LID-like numbers
const cleanPhone = (phone: string | null | undefined): string | undefined => {
  if (!phone) return undefined;
  if (isLidPhone(phone)) return undefined;
  return phone;
};

// Format phone number for display
const formatPhoneDisplay = (phone: string | null | undefined) => {
  if (!phone) return "-";
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  } else if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  } else if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

// Parse CSV content
const parseCSV = (content: string): { headers: string[]; rows: string[][] } => {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
  return { headers, rows };
};

export default function Contatos() {
  const { hasPermission, isAdmin } = useAuth();
  const canEdit = isAdmin || hasPermission('contatos', 'edit');
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [editContact, setEditContact] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  
  // Bulk selection state
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // Import state
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<{ name: number; email: number; phone: number; company: number }>({ name: -1, email: -1, phone: -1, company: -1 });
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: contacts, isLoading, isError, error, refetch } = useContacts();
  const createContact = useCreateContact();
  const deleteContact = useDeleteContact();
  const updateContact = useUpdateContact();
  const syncContacts = useSyncContacts();

  // Count contacts with issues
  const problemContactsCount = contacts?.filter(c => 
    hasLidIssue(c) || hasPlaceholderName(c)
  ).length || 0;

  // Count LID-only contacts (no real phone)
  const lidOnlyContacts = contacts?.filter(c => 
    !c.phone && (c as any).whatsapp_lid
  ) || [];
  const lidOnlyCount = lidOnlyContacts.length;

  // State for LID resolution
  const [resolvingLidIds, setResolvingLidIds] = useState<Set<string>>(new Set());
  const [isBulkResolving, setIsBulkResolving] = useState(false);
  const [bulkResolveProgress, setBulkResolveProgress] = useState({ current: 0, total: 0, resolved: 0 });

  const handleResolveLid = async (contact: Contact) => {
    const whatsappLid = (contact as any).whatsapp_lid;
    if (!whatsappLid) return;
    
    setResolvingLidIds(prev => new Set(prev).add(contact.id));
    
    try {
      const { data, error } = await supabase.functions.invoke('resolve-lid-contact', {
        body: { contactId: contact.id, whatsappLid }
      });
      
      if (error) throw error;
      
      if (data?.success && data?.realPhone) {
        toast.success(`Número encontrado: ${data.realPhone}`);
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      } else {
        toast.info("Não foi possível resolver o número. O contato precisa enviar uma nova mensagem.");
      }
    } catch (err) {
      console.error('Error resolving LID:', err);
      toast.error("Erro ao tentar resolver o número");
    } finally {
      setResolvingLidIds(prev => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
    }
  };

  const handleBulkResolveLids = async () => {
    if (lidOnlyContacts.length === 0) return;
    
    setIsBulkResolving(true);
    setBulkResolveProgress({ current: 0, total: lidOnlyContacts.length, resolved: 0 });
    
    let resolved = 0;
    
    for (let i = 0; i < lidOnlyContacts.length; i++) {
      const contact = lidOnlyContacts[i];
      const whatsappLid = (contact as any).whatsapp_lid;
      
      setBulkResolveProgress(prev => ({ ...prev, current: i + 1 }));
      
      if (!whatsappLid) continue;
      
      try {
        const { data, error } = await supabase.functions.invoke('resolve-lid-contact', {
          body: { contactId: contact.id, whatsappLid }
        });
        
        if (!error && data?.success && data?.realPhone) {
          resolved++;
          setBulkResolveProgress(prev => ({ ...prev, resolved }));
        }
      } catch {
        // Continue with next contact
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(r => setTimeout(r, 300));
    }
    
    setIsBulkResolving(false);
    
    if (resolved > 0) {
      toast.success(`${resolved} de ${lidOnlyContacts.length} números resolvidos!`);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } else {
      toast.info("Nenhum número pôde ser resolvido. Os contatos precisam enviar novas mensagens.");
    }
  };

  const filteredContacts = contacts?.filter((c) => {
    if (searchQuery.startsWith("status:")) {
      return c.status === searchQuery.replace("status:", "");
    }
    return c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery);
  }) || [];

  const handleCreateContact = async () => {
    if (!newContact.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    
    // Clean phone to avoid saving LID-like numbers
    const cleanedPhone = cleanPhone(newContact.phone.trim());
    
    await createContact.mutateAsync({
      name: newContact.name.trim(),
      email: newContact.email.trim() || undefined,
      phone: cleanedPhone,
      company: newContact.company.trim() || undefined,
      notes: newContact.notes.trim() || undefined,
    });
    
    setNewContact({ name: "", email: "", phone: "", company: "", notes: "" });
    setIsDialogOpen(false);
  };

  const handleUpdateContact = async () => {
    if (!selectedContact || !editContact.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    
    // Clean phone to avoid saving LID-like numbers
    const cleanedPhone = cleanPhone(editContact.phone.trim());
    
    await updateContact.mutateAsync({
      id: selectedContact.id,
      name: editContact.name.trim(),
      email: editContact.email.trim() || undefined,
      phone: cleanedPhone,
      company: editContact.company.trim() || undefined,
      notes: editContact.notes.trim() || undefined,
    });
    
    setIsEditDialogOpen(false);
    setSelectedContact(null);
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;
    await deleteContact.mutateAsync(selectedContact.id);
    setIsDeleteDialogOpen(false);
    setSelectedContact(null);
  };

  const handleBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;
    
    setIsBulkDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedContactIds) {
      try {
        await deleteContact.mutateAsync(id);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsBulkDeleting(false);
    setIsBulkDeleteDialogOpen(false);
    setSelectedContactIds([]);

    if (successCount > 0) {
      toast.success(`${successCount} contatos excluídos com sucesso!`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} contatos falharam ao excluir`);
    }
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const toggleAllContacts = () => {
    if (selectedContactIds.length === filteredContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(filteredContacts.map(c => c.id));
    }
  };

  const openViewDialog = (contact: Contact) => {
    setSelectedContact(contact);
    setIsViewDialogOpen(true);
  };

  const openEditDialog = (contact: Contact) => {
    setSelectedContact(contact);
    setEditContact({
      name: contact.name,
      email: contact.email || "",
      phone: contact.phone || "",
      company: contact.company || "",
      notes: contact.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDeleteDialogOpen(true);
  };

  const formatLastContact = (date: string | null) => {
    if (!date) return "Nunca";
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseCSV(content);
      setCsvData(parsed);
      
      // Auto-map columns if headers match common names
      const nameIndex = parsed.headers.findIndex(h => 
        h.toLowerCase().includes('nome') || h.toLowerCase().includes('name')
      );
      const emailIndex = parsed.headers.findIndex(h => 
        h.toLowerCase().includes('email') || h.toLowerCase().includes('e-mail')
      );
      const phoneIndex = parsed.headers.findIndex(h => 
        h.toLowerCase().includes('telefone') || h.toLowerCase().includes('phone') || h.toLowerCase().includes('celular')
      );
      const companyIndex = parsed.headers.findIndex(h => 
        h.toLowerCase().includes('empresa') || h.toLowerCase().includes('company')
      );
      
      setColumnMapping({
        name: nameIndex,
        email: emailIndex,
        phone: phoneIndex,
        company: companyIndex,
      });
    };
    reader.readAsText(file);
  };

  const handleImportContacts = async () => {
    if (!csvData || columnMapping.name === -1) {
      toast.error("Selecione a coluna de Nome");
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of csvData.rows) {
      const name = row[columnMapping.name]?.trim();
      if (!name) continue;

      try {
        const { error } = await supabase.from('contacts').insert({
          name,
          email: columnMapping.email >= 0 ? row[columnMapping.email]?.trim() || null : null,
          phone: columnMapping.phone >= 0 ? row[columnMapping.phone]?.trim() || null : null,
          company: columnMapping.company >= 0 ? row[columnMapping.company]?.trim() || null : null,
        });

        if (error) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setIsImporting(false);
    setIsImportDialogOpen(false);
    setCsvData(null);
    setColumnMapping({ name: -1, email: -1, phone: -1, company: -1 });
    
    if (successCount > 0) {
      toast.success(`${successCount} contatos importados com sucesso!`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} contatos falharam ao importar`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive font-medium">Erro ao carregar contatos</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error?.message}</p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold">Contatos</h2>
            <p className="text-muted-foreground">
              {contacts?.length || 0} contatos cadastrados
            </p>
          </div>
          {!canEdit && <ReadOnlyBadge />}
        </div>
        <div className="flex gap-2">
          {lidOnlyCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="gap-2" 
                    onClick={handleBulkResolveLids}
                    disabled={isBulkResolving || !canEdit}
                  >
                    {isBulkResolving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    {isBulkResolving 
                      ? `Resolvendo ${bulkResolveProgress.current}/${bulkResolveProgress.total}...`
                      : `Resolver Números (${lidOnlyCount})`
                    }
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Tenta descobrir o número real dos {lidOnlyCount} contatos pendentes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  className="gap-2" 
                  onClick={() => syncContacts.mutate()}
                  disabled={syncContacts.isPending || !canEdit}
                >
                  {syncContacts.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Sincronizar
                  {problemContactsCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                      {problemContactsCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Sincroniza contatos com o WhatsApp e corrige duplicatas</p>
                {problemContactsCount > 0 && (
                  <p className="text-warning">{problemContactsCount} contatos com problemas detectados</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" className="gap-2" onClick={() => setIsImportDialogOpen(true)} disabled={!canEdit}>
            <Upload className="w-4 h-4" />
            Importar
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!canEdit}>
                <Plus className="w-4 h-4" />
                Novo Contato
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Contato</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input 
                  placeholder="Nome completo"
                  value={newContact.name}
                  onChange={(e) => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input 
                  type="email" 
                  placeholder="email@exemplo.com"
                  value={newContact.email}
                  onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input 
                  placeholder="(00) 00000-0000"
                  value={newContact.phone}
                  onChange={(e) => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input 
                  placeholder="Nome da empresa"
                  value={newContact.company}
                  onChange={(e) => setNewContact(prev => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea 
                  placeholder="Observações sobre o contato"
                  value={newContact.notes}
                  onChange={(e) => setNewContact(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreateContact}
                disabled={createContact.isPending}
              >
                {createContact.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Contato"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Bulk resolve progress bar */}
      {isBulkResolving && (
        <div className="space-y-2 p-3 bg-muted rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span>Resolvendo números... ({bulkResolveProgress.current}/{bulkResolveProgress.total})</span>
            <span className="text-muted-foreground">{bulkResolveProgress.resolved} encontrados</span>
          </div>
          <Progress value={(bulkResolveProgress.current / bulkResolveProgress.total) * 100} className="h-2" />
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
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
            <DropdownMenuItem onClick={() => setSearchQuery("status:active")}>
              Ativos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSearchQuery("status:inactive")}>
              Inativos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {selectedContactIds.length > 0 && (
          <Button 
            variant="destructive" 
            className="gap-2"
            onClick={() => setIsBulkDeleteDialogOpen(true)}
            disabled={!canEdit}
          >
            <Trash2 className="w-4 h-4" />
            Excluir ({selectedContactIds.length})
          </Button>
        )}
      </div>

      {/* Bulk Selection Bar */}
      {selectedContactIds.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedContactIds.length} de {filteredContacts.length} selecionados
          </span>
          <Button variant="ghost" size="sm" onClick={toggleAllContacts}>
            {selectedContactIds.length === filteredContacts.length ? (
              <>
                <X className="w-4 h-4 mr-1" />
                Desmarcar todos
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4 mr-1" />
                Selecionar todos
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedContactIds([])}>
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="table-container overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox 
                  checked={selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0}
                  onCheckedChange={toggleAllContacts}
                  disabled={!canEdit}
                />
              </TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Último Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow key={contact.id} className={selectedContactIds.includes(contact.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedContactIds.includes(contact.id)}
                      onCheckedChange={() => toggleContactSelection(contact.id)}
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={contact.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.email || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {!contact.phone && (contact as any).whatsapp_lid ? (
                        <>
                          <span className="text-muted-foreground text-sm italic">Pendente</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleResolveLid(contact)}
                                  disabled={resolvingLidIds.has(contact.id) || !canEdit}
                                >
                                  {resolvingLidIds.has(contact.id) ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Search className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Tentar descobrir o número real</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      ) : (
                        <>
                          <span>{formatPhoneDisplay(contact.phone)}</span>
                          {hasLidIssue(contact) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="w-4 h-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Número precisa de sincronização</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.tags?.map((tag) => (
                        <Badge 
                          key={tag.id} 
                          variant="secondary" 
                          className="text-xs"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      {(!contact.tags || contact.tags.length === 0) && (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatLastContact(contact.last_contact_at)}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        contact.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {contact.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openViewDialog(contact)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver informações
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Iniciar conversa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(contact)} disabled={!canEdit}>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => openDeleteDialog(contact)}
                          disabled={!canEdit}
                        >
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

      {/* View Contact Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informações do Contato</DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={selectedContact.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {selectedContact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{selectedContact.name}</h3>
                  <Badge
                    className={
                      selectedContact.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {selectedContact.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {selectedContact.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContact.email}</span>
                  </div>
                )}
                {selectedContact.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContact.phone}</span>
                  </div>
                )}
                {selectedContact.company && (
                  <div className="flex items-center gap-3 text-sm">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContact.company}</span>
                  </div>
                )}
              </div>

              {selectedContact.tags && selectedContact.tags.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Tag className="w-4 h-4" />
                    <span>Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedContact.tags.map((tag) => (
                      <Badge 
                        key={tag.id} 
                        variant="secondary"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedContact.notes && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span>Notas</span>
                  </div>
                  <p className="text-sm bg-muted/50 rounded-lg p-3">{selectedContact.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    openEditDialog(selectedContact);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button className="flex-1">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Iniciar Conversa
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input 
                placeholder="Nome completo"
                value={editContact.name}
                onChange={(e) => setEditContact(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input 
                type="email" 
                placeholder="email@exemplo.com"
                value={editContact.email}
                onChange={(e) => setEditContact(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input 
                placeholder="(00) 00000-0000"
                value={editContact.phone}
                onChange={(e) => setEditContact(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input 
                placeholder="Nome da empresa"
                value={editContact.company}
                onChange={(e) => setEditContact(prev => ({ ...prev, company: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea 
                placeholder="Observações sobre o contato"
                value={editContact.notes}
                onChange={(e) => setEditContact(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={handleUpdateContact}
              disabled={updateContact.isPending}
            >
              {updateContact.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contato "{selectedContact?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={handleDeleteContact}
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        setIsImportDialogOpen(open);
        if (!open) {
          setCsvData(null);
          setColumnMapping({ name: -1, email: -1, phone: -1, company: -1 });
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Importar Contatos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!csvData ? (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Selecione um arquivo CSV para importar contatos
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                  Selecionar Arquivo
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Coluna do Nome *</Label>
                    <select
                      value={columnMapping.name}
                      onChange={(e) => setColumnMapping(prev => ({ ...prev, name: parseInt(e.target.value) }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value={-1}>Selecione...</option>
                      {csvData.headers.map((header, index) => (
                        <option key={index} value={index}>{header}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Coluna do E-mail</Label>
                    <select
                      value={columnMapping.email}
                      onChange={(e) => setColumnMapping(prev => ({ ...prev, email: parseInt(e.target.value) }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value={-1}>Nenhuma</option>
                      {csvData.headers.map((header, index) => (
                        <option key={index} value={index}>{header}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Coluna do Telefone</Label>
                    <select
                      value={columnMapping.phone}
                      onChange={(e) => setColumnMapping(prev => ({ ...prev, phone: parseInt(e.target.value) }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value={-1}>Nenhuma</option>
                      {csvData.headers.map((header, index) => (
                        <option key={index} value={index}>{header}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Coluna da Empresa</Label>
                    <select
                      value={columnMapping.company}
                      onChange={(e) => setColumnMapping(prev => ({ ...prev, company: parseInt(e.target.value) }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value={-1}>Nenhuma</option>
                      {csvData.headers.map((header, index) => (
                        <option key={index} value={index}>{header}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="border rounded-lg p-4 bg-muted/50">
                  <p className="text-sm font-medium mb-2">Preview ({csvData.rows.length} linhas)</p>
                  <div className="max-h-40 overflow-auto text-sm">
                    {csvData.rows.slice(0, 5).map((row, i) => (
                      <div key={i} className="py-1 border-b border-border last:border-0">
                        {columnMapping.name >= 0 && <span className="font-medium">{row[columnMapping.name]}</span>}
                        {columnMapping.email >= 0 && row[columnMapping.email] && <span className="text-muted-foreground"> - {row[columnMapping.email]}</span>}
                        {columnMapping.phone >= 0 && row[columnMapping.phone] && <span className="text-muted-foreground"> - {row[columnMapping.phone]}</span>}
                      </div>
                    ))}
                    {csvData.rows.length > 5 && (
                      <p className="text-muted-foreground pt-2">... e mais {csvData.rows.length - 5} contatos</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          {csvData && (
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setCsvData(null);
                setColumnMapping({ name: -1, email: -1, phone: -1, company: -1 });
              }}>
                Voltar
              </Button>
              <Button onClick={handleImportContacts} disabled={isImporting || columnMapping.name === -1}>
                {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Importar {csvData.rows.length} Contatos
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedContactIds.length} contatos?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedContactIds.length} contatos selecionados? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir {selectedContactIds.length} contatos
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}