import { useState, useEffect, useRef, ChangeEvent } from "react";
import { Search, Filter, MoreVertical, Send, Smile, Paperclip, CheckCircle, Loader2, MessageCircle, Image, FileText, Mic, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useConversations, useMessages, useSendMessage, useUpdateConversation, Conversation, Message } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const statusConfig = {
  new: { label: "Novo", className: "bg-primary/10 text-primary" },
  in_progress: { label: "Em Atendimento", className: "bg-warning/10 text-warning" },
  resolved: { label: "Resolvido", className: "bg-success/10 text-success" },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground" },
};

interface MediaPreview {
  file: File;
  type: 'image' | 'document' | 'audio';
  previewUrl?: string;
}

export default function Atendimento() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: messages, isLoading: messagesLoading } = useMessages(selectedConversation?.id || "");
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();

  // Helper para obter nome de exibição (nome > telefone > "Contato")
  const getDisplayName = (contact?: Conversation['contact']) => {
    if (!contact) return "Contato";
    return contact.name || contact.phone || "Contato";
  };

  // Helper para formatar telefone para exibição
  const formatPhoneDisplay = (phone?: string | null) => {
    if (!phone) return null;
    // Tenta formatar como +55 (XX) XXXXX-XXXX
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    } else if (cleaned.length === 12) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    return phone;
  };

  // Helper para obter iniciais
  const getInitials = (contact?: Conversation['contact']) => {
    const name = getDisplayName(contact);
    if (name === "Contato") return "?";
    // Se for telefone, usa os últimos 2 dígitos
    if (/^\d+$/.test(name.replace(/\D/g, '')) && name.replace(/\D/g, '').length > 2) {
      return name.replace(/\D/g, '').slice(-2);
    }
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  };

  const filteredConversations = conversations?.filter((c) => {
    const name = c.contact?.name?.toLowerCase() || "";
    const phone = c.contact?.phone?.toLowerCase() || "";
    const query = searchQuery.toLowerCase();
    return name.includes(query) || phone.includes(query);
  }) || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Select first conversation by default
  useEffect(() => {
    if (!selectedConversation && conversations && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation]);

  // Atualizar conversa selecionada quando os dados mudarem (real-time sync)
  useEffect(() => {
    if (selectedConversation && conversations) {
      const updated = conversations.find(c => c.id === selectedConversation.id);
      if (updated) {
        setSelectedConversation(updated);
      }
    }
  }, [conversations]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (mediaPreview?.previewUrl) {
        URL.revokeObjectURL(mediaPreview.previewUrl);
      }
    };
  }, [mediaPreview]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 10MB",
        variant: "destructive",
      });
      return;
    }

    const previewUrl = type === 'image' ? URL.createObjectURL(file) : undefined;
    setMediaPreview({ file, type, previewUrl });
    setAttachmentOpen(false);
    
    // Reset input
    e.target.value = '';
  };

  const clearMediaPreview = () => {
    if (mediaPreview?.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }
    setMediaPreview(null);
  };

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !mediaPreview) || !selectedConversation || !user) return;

    const isWhatsApp = selectedConversation.channel === "whatsapp";

    try {
      if (mediaPreview) {
        // For now, we'll need to upload the file first and get a URL
        // This is a placeholder - in production, you'd upload to Supabase Storage
        toast({
          title: "Enviando mídia...",
          description: `Enviando ${mediaPreview.type === 'image' ? 'imagem' : 'documento'}`,
        });

        // TODO: Upload file to storage and get URL
        // For now, just send the text content
        if (messageText.trim()) {
          await sendMessage.mutateAsync({
            conversationId: selectedConversation.id,
            content: messageText.trim(),
            senderId: user.id,
            senderType: "agent",
            sendViaWhatsApp: isWhatsApp,
            messageType: mediaPreview.type,
          });
        }

        clearMediaPreview();
      } else {
        await sendMessage.mutateAsync({
          conversationId: selectedConversation.id,
          content: messageText.trim(),
          senderId: user.id,
          senderType: "agent",
          sendViaWhatsApp: isWhatsApp,
        });
      }

      setMessageText("");

      // Update conversation status if it's new
      if (selectedConversation.status === "new") {
        await updateConversation.mutateAsync({
          id: selectedConversation.id,
          status: "in_progress",
          assigned_to: user.id,
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleResolve = async () => {
    if (!selectedConversation) return;
    
    await updateConversation.mutateAsync({
      id: selectedConversation.id,
      status: "resolved",
    });
  };

  const formatTime = (date: string) => {
    return format(new Date(date), "HH:mm", { locale: ptBR });
  };

  const formatRelativeTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
  };

  const renderMessage = (message: Message) => {
    const isOutgoing = message.sender_type === "agent";
    
    return (
      <div
        key={message.id}
        className={cn(
          "flex",
          isOutgoing ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            "max-w-[70%]",
            isOutgoing ? "chat-bubble-outgoing" : "chat-bubble-incoming"
          )}
        >
          {message.message_type === "image" && message.media_url && (
            <img 
              src={message.media_url} 
              alt="Imagem" 
              className="rounded-lg max-w-full mb-2 cursor-pointer hover:opacity-90"
              onClick={() => window.open(message.media_url!, '_blank')}
            />
          )}
          {message.message_type === "document" && message.media_url && (
            <a 
              href={message.media_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-background/50 rounded mb-2 hover:bg-background/70"
            >
              <FileText className="w-5 h-5" />
              <span className="text-sm underline">Documento</span>
            </a>
          )}
          {message.message_type === "audio" && message.media_url && (
            <audio controls className="max-w-full mb-2">
              <source src={message.media_url} />
            </audio>
          )}
          {message.content && (
            <p className="text-sm">{message.content}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1 text-right">
            {formatTime(message.created_at)}
          </p>
        </div>
      </div>
    );
  };

  if (conversationsLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] bg-card rounded-xl border border-border overflow-hidden">
      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'document')}
      />

      {/* Contact List */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 input-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              <Filter className="w-4 h-4 mr-2" />
              Filtrar
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={cn(
                  "conversation-item border-b border-border cursor-pointer",
                  selectedConversation?.id === conversation.id && "conversation-item-active"
                )}
              >
              <Avatar className="w-12 h-12">
                  <AvatarImage src={conversation.contact?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {getInitials(conversation.contact)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm truncate">{getDisplayName(conversation.contact)}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(conversation.last_message_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {conversation.subject || "Sem assunto"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={cn("text-[10px] px-1.5 py-0.5", statusConfig[conversation.status].className)}>
                    {statusConfig[conversation.status].label}
                  </Badge>
                  {conversation.unread_count > 0 && (
                    <Badge className="bg-primary text-primary-foreground w-5 h-5 p-0 flex items-center justify-center rounded-full text-xs">
                      {conversation.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="h-16 border-b border-border flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedConversation.contact?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(selectedConversation.contact)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{getDisplayName(selectedConversation.contact)}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {formatPhoneDisplay(selectedConversation.contact?.phone) || selectedConversation.contact?.email || "-"}
                  </p>
                  {selectedConversation.channel === "whatsapp" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-green-600 border-green-600/30">
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedConversation.status !== "resolved" && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={handleResolve}
                  disabled={updateConversation.isPending}
                >
                  <CheckCircle className="w-4 h-4" />
                  Resolver
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Ver perfil</DropdownMenuItem>
                  <DropdownMenuItem>Adicionar tag</DropdownMenuItem>
                  <DropdownMenuItem>Transferir</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Arquivar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30 scrollbar-thin">
            {messagesLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : messages && messages.length > 0 ? (
              <>
                {messages.map(renderMessage)}
                <div ref={messagesEndRef} />
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Nenhuma mensagem ainda. Inicie a conversa!
              </div>
            )}
          </div>

          {/* Media Preview */}
          {mediaPreview && (
            <div className="px-4 py-2 border-t border-border bg-muted/50">
              <div className="flex items-center gap-3">
                {mediaPreview.type === 'image' && mediaPreview.previewUrl && (
                  <img 
                    src={mediaPreview.previewUrl} 
                    alt="Preview" 
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                {mediaPreview.type === 'document' && (
                  <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mediaPreview.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(mediaPreview.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={clearMediaPreview}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Message Input */}
          <div className="p-4 border-t border-border">
            <div className="flex items-end gap-2">
              <Button variant="ghost" size="icon" className="shrink-0">
                <Smile className="w-5 h-5" />
              </Button>
              <Popover open={attachmentOpen} onOpenChange={setAttachmentOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Paperclip className="w-5 h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-1">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-2"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <Image className="w-4 h-4 text-blue-500" />
                      Imagem
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileText className="w-4 h-4 text-orange-500" />
                      Documento
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-2"
                      disabled
                    >
                      <Mic className="w-4 h-4 text-green-500" />
                      Áudio (em breve)
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Textarea
                placeholder="Digite sua mensagem..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button 
                size="icon" 
                className="shrink-0 bg-accent hover:bg-accent/90"
                onClick={handleSendMessage}
                disabled={(!messageText.trim() && !mediaPreview) || sendMessage.isPending}
              >
                {sendMessage.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Selecione uma conversa para começar
        </div>
      )}
    </div>
  );
}
