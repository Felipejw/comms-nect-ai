import { useState } from 'react';
import { X, Camera, Save, Loader2, Mail, Phone, Building, Tag as TagIcon, MessageSquare, Clock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  useContactProfile, 
  useContactConversationHistory, 
  useUpdateContactNotes,
  useFetchWhatsAppProfilePicture 
} from '@/hooks/useContactProfile';
import { useTags, useAddTagToContact, useRemoveTagFromContact } from '@/hooks/useTags';
import { useUpdateContact } from '@/hooks/useContacts';
import { useKanbanColumns } from '@/hooks/useKanbanColumns';
import { useUpdateConversation } from '@/hooks/useConversations';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactProfilePanelProps {
  contactId: string;
  conversationId?: string;
  onClose: () => void;
}

const statusConfig = {
  new: { label: 'Nova', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'Em Atendimento', className: 'bg-warning/10 text-warning' },
  resolved: { label: 'Resolvida', className: 'bg-success/10 text-success' },
  archived: { label: 'Arquivada', className: 'bg-muted text-muted-foreground' },
};

export default function ContactProfilePanel({ contactId, conversationId, onClose }: ContactProfilePanelProps) {
  const { data: contact, isLoading: contactLoading } = useContactProfile(contactId);
  const { data: history, isLoading: historyLoading } = useContactConversationHistory(contactId);
  const { data: allTags } = useTags();
  const { data: kanbanColumns = [] } = useKanbanColumns();
  
  const updateNotes = useUpdateContactNotes();
  const updateContact = useUpdateContact();
  const updateConversation = useUpdateConversation();
  const fetchProfilePicture = useFetchWhatsAppProfilePicture();
  const addTagToContact = useAddTagToContact();
  const removeTagFromContact = useRemoveTagFromContact();
  
  const [notes, setNotes] = useState<string | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState<string>('');

  const handleSaveNotes = async () => {
    if (!contact || notes === null) return;
    await updateNotes.mutateAsync({ contactId: contact.id, notes });
    setIsEditingNotes(false);
    setNotes(null);
  };

  const handleSaveName = async () => {
    if (!contact || !editedName.trim()) return;
    // name_source: 'manual' é automaticamente setado pelo useUpdateContact quando name é alterado
    await updateContact.mutateAsync({ id: contact.id, name: editedName.trim() });
    setIsEditingName(false);
    setEditedName('');
  };

  const handleFetchProfilePicture = async () => {
    if (!contact) return;
    await fetchProfilePicture.mutateAsync({ contactId: contact.id });
  };

  // Get current kanban column from conversation history
  const currentConversation = history?.find(c => c.id === conversationId);
  const currentKanbanColumnId = currentConversation?.kanban_column_id;
  const currentKanbanColumn = kanbanColumns.find(c => c.id === currentKanbanColumnId);

  const handleKanbanChange = async (columnId: string) => {
    if (!conversationId) return;
    await updateConversation.mutateAsync({ 
      id: conversationId, 
      kanban_column_id: columnId === 'none' ? null : columnId
    });
  };

  const handleAddTag = async (tagId: string) => {
    if (!contact) return;
    await addTagToContact.mutateAsync({ contactId: contact.id, tagId });
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!contact) return;
    await removeTagFromContact.mutateAsync({ contactId: contact.id, tagId });
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const formatPhoneDisplay = (phone?: string | null) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    } else if (cleaned.length === 12) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    return phone;
  };

  // Get tags not yet assigned to contact
  const availableTags = allTags?.filter(
    tag => !contact?.tags?.some(ct => ct.id === tag.id)
  ) || [];

  if (contactLoading) {
    return (
      <div className="w-80 border-l border-border flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="w-80 border-l border-border flex items-center justify-center text-muted-foreground">
        Contato não encontrado
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border flex flex-col bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">Perfil do Contato</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Avatar and Name */}
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar className="w-20 h-20">
                <AvatarImage src={contact.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {getInitials(contact.name || contact.phone || undefined)}
                </AvatarFallback>
              </Avatar>
              {!contact.avatar_url && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full"
                  onClick={handleFetchProfilePicture}
                  disabled={fetchProfilePicture.isPending}
                >
                  {fetchProfilePicture.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Camera className="w-3 h-3" />
                  )}
                </Button>
              )}
            </div>
            
            {/* Editable Name */}
            <div className="mt-3 flex items-center gap-1">
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 text-center font-semibold"
                    placeholder="Nome do contato"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') {
                        setIsEditingName(false);
                        setEditedName('');
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    onClick={handleSaveName}
                    disabled={updateContact.isPending || !editedName.trim()}
                  >
                    {updateContact.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    onClick={() => {
                      setIsEditingName(false);
                      setEditedName('');
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <h4 className="font-semibold">{contact.name || contact.phone || 'Contato'}</h4>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6"
                    onClick={() => {
                      setEditedName(contact.name || '');
                      setIsEditingName(true);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
            
            {currentKanbanColumn && (
              <Badge style={{ backgroundColor: `${currentKanbanColumn.color}20`, color: currentKanbanColumn.color }}>
                {currentKanbanColumn.name}
              </Badge>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-2">
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{formatPhoneDisplay(contact.phone)}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-sm">
                <Building className="w-4 h-4 text-muted-foreground" />
                <span>{contact.company}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Kanban Stage */}
          <div>
            <label className="text-sm font-medium mb-2 block">Etapa do Kanban</label>
            <Select 
              value={currentKanbanColumnId || 'none'} 
              onValueChange={handleKanbanChange}
              disabled={updateConversation.isPending || !conversationId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma etapa</SelectItem>
                {kanbanColumns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: column.color || '#3B82F6' }}
                      />
                      {column.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TagIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {contact.tags?.map(tag => (
                <Badge
                  key={tag.id}
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                  className="cursor-pointer hover:opacity-70"
                  onClick={() => handleRemoveTag(tag.id)}
                >
                  {tag.name} ×
                </Badge>
              ))}
              {(!contact.tags || contact.tags.length === 0) && (
                <span className="text-xs text-muted-foreground">Nenhuma tag</span>
              )}
            </div>
            {availableTags.length > 0 && (
              <Select onValueChange={handleAddTag}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Adicionar tag..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map(tag => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Notas</span>
              {isEditingNotes ? (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleSaveNotes}
                  disabled={updateNotes.isPending}
                >
                  {updateNotes.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => {
                    setNotes(contact.notes || '');
                    setIsEditingNotes(true);
                  }}
                >
                  Editar
                </Button>
              )}
            </div>
            {isEditingNotes ? (
              <Textarea
                value={notes || ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione notas sobre este contato..."
                className="min-h-[80px] text-sm"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {contact.notes || 'Nenhuma nota adicionada.'}
              </p>
            )}
          </div>

          <Separator />

          {/* Conversation History */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Histórico de Conversas</span>
            </div>
            {historyLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : history && history.length > 0 ? (
              <div className="space-y-2">
                {history.map(conv => (
                  <div 
                    key={conv.id} 
                    className="p-2 rounded-lg bg-muted/50 text-sm"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge className={statusConfig[conv.status].className}>
                        {statusConfig[conv.status].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(conv.last_message_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.subject || 'Sem assunto'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma conversa anterior</p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
