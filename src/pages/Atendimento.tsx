import { useState, useEffect, useRef, ChangeEvent } from "react";
import { Search, Filter, MoreVertical, Send, Smile, Paperclip, CheckCircle, Loader2, MessageCircle, Image, FileText, Mic, X, User, Trash2, Check, CheckCheck, Square } from "lucide-react";
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useConversations, useMessages, useSendMessage, useUpdateConversation, useDeleteConversation, Conversation, Message } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import ContactProfilePanel from "@/components/atendimento/ContactProfilePanel";

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
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: messages, isLoading: messagesLoading } = useMessages(selectedConversation?.id || "");
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();
  const deleteConversation = useDeleteConversation();
  const uploadFile = useFileUpload();
  const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  // Helper para obter nome de exibição (nome > telefone > "Contato")
  const getDisplayName = (contact?: Conversation['contact']) => {
    if (!contact) return "Contato";
    return contact.name || contact.phone || "Contato";
  };

  // Helper para formatar telefone para exibição
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

  // Helper para obter iniciais
  const getInitials = (contact?: Conversation['contact']) => {
    const name = getDisplayName(contact);
    if (name === "Contato") return "?";
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

  // Close profile panel when conversation changes
  useEffect(() => {
    setShowProfilePanel(false);
  }, [selectedConversation?.id]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    e.target.value = '';
  };

  const clearMediaPreview = () => {
    if (mediaPreview?.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }
    setMediaPreview(null);
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
      toast({
        title: "Gravando áudio...",
        description: "Clique no botão enviar para parar e enviar",
      });
    } catch (error) {
      toast({
        title: "Erro ao gravar",
        description: "Permita o acesso ao microfone para gravar áudio",
        variant: "destructive",
      });
    }
  };

  const handleSendAudio = async () => {
    if (!selectedConversation || !user) return;
    
    const audioBlob = await stopRecording();
    if (!audioBlob) return;

    const isWhatsApp = selectedConversation.channel === "whatsapp";
    
    try {
      setIsUploading(true);
      const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
      const mediaUrl = await uploadFile.mutateAsync(audioFile);
      setIsUploading(false);

      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        content: '🎤 Áudio',
        senderId: user.id,
        senderType: "agent",
        sendViaWhatsApp: isWhatsApp,
        messageType: 'audio',
        mediaUrl,
      });

      if (selectedConversation.status === "new") {
        await updateConversation.mutateAsync({
          id: selectedConversation.id,
          status: "in_progress",
          assigned_to: user.id,
        });
      }
    } catch (error) {
      console.error("Error sending audio:", error);
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (isRecording) {
      await handleSendAudio();
      return;
    }

    if ((!messageText.trim() && !mediaPreview) || !selectedConversation || !user) return;

    const isWhatsApp = selectedConversation.channel === "whatsapp";

    try {
      let mediaUrl: string | undefined;

      if (mediaPreview) {
        setIsUploading(true);
        toast({
          title: "Enviando arquivo...",
          description: `Fazendo upload do ${mediaPreview.type === 'image' ? 'imagem' : 'documento'}`,
        });

        try {
          mediaUrl = await uploadFile.mutateAsync(mediaPreview.file);
        } catch (uploadError) {
          console.error("Upload error:", uploadError);
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }

      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        content: messageText.trim() || (mediaPreview?.type === 'image' ? '📷 Imagem' : mediaPreview?.file.name || ''),
        senderId: user.id,
        senderType: "agent",
        sendViaWhatsApp: isWhatsApp,
        messageType: mediaPreview?.type || 'text',
        mediaUrl,
      });

      setMessageText("");
      clearMediaPreview();

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

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;
    
    await deleteConversation.mutateAsync(selectedConversation.id);
    setSelectedConversation(null);
    setShowDeleteDialog(false);
    setShowMobileChat(false);
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowMobileChat(true);
  };

  const formatTime = (date: string) => {
    return format(new Date(date), "HH:mm", { locale: ptBR });
  };

  const formatRelativeTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
  };

  const renderDeliveryStatus = (message: Message) => {
    if (message.sender_type !== 'agent') return null;

    const status = message.delivery_status || 'sent';
    
    switch (status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'sent':
      default:
        return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
    }
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
            "max-w-[85%] sm:max-w-[70%]",
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
            <p className="text-sm break-words">{message.content}</p>
          )}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {formatTime(message.created_at)}
            </span>
            {renderDeliveryStatus(message)}
          </div>
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
      <div className={cn(
        "w-full md:w-80 lg:w-96 border-r border-border flex flex-col",
        showMobileChat && "hidden md:flex"
      )}>
        <div className="p-3 sm:p-4 border-b border-border space-y-3">
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
                onClick={() => handleSelectConversation(conversation)}
                className={cn(
                  "conversation-item border-b border-border cursor-pointer p-3 sm:p-4",
                  selectedConversation?.id === conversation.id && "conversation-item-active"
                )}
              >
                <Avatar className="w-10 h-10 sm:w-12 sm:h-12 shrink-0">
                  <AvatarImage src={conversation.contact?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                    {getInitials(conversation.contact)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="font-medium text-sm truncate">{getDisplayName(conversation.contact)}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(conversation.last_message_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {conversation.subject || "Sem assunto"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
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
        <div className={cn(
          "flex-1 flex flex-col min-w-0",
          !showMobileChat && "hidden md:flex"
        )}>
          {/* Chat Header */}
          <div className="h-14 sm:h-16 border-b border-border flex items-center justify-between px-3 sm:px-4 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden shrink-0"
                onClick={() => setShowMobileChat(false)}
              >
                <X className="w-5 h-5" />
              </Button>
              <Avatar className="w-8 h-8 sm:w-10 sm:h-10 shrink-0">
                <AvatarImage src={selectedConversation.contact?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {getInitials(selectedConversation.contact)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm sm:text-base truncate">{getDisplayName(selectedConversation.contact)}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground truncate">
                    {formatPhoneDisplay(selectedConversation.contact?.phone) || selectedConversation.contact?.email || "-"}
                  </p>
                  {selectedConversation.channel === "whatsapp" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-green-600 border-green-600/30 hidden sm:flex">
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 hidden lg:flex"
                onClick={() => setShowProfilePanel(!showProfilePanel)}
              >
                <User className="w-4 h-4" />
                Perfil
              </Button>
              {selectedConversation.status !== "resolved" && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2 hidden sm:flex"
                  onClick={handleResolve}
                  disabled={updateConversation.isPending}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="hidden md:inline">Resolver</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowProfilePanel(true)}>
                    <User className="w-4 h-4 mr-2" />
                    Ver perfil
                  </DropdownMenuItem>
                  {selectedConversation.status !== "resolved" && (
                    <DropdownMenuItem onClick={handleResolve} className="sm:hidden">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Resolver
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem>Adicionar tag</DropdownMenuItem>
                  <DropdownMenuItem>Transferir</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/30 scrollbar-thin">
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
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm text-center px-4">
                Nenhuma mensagem ainda. Inicie a conversa!
              </div>
            )}
          </div>

          {/* Media Preview */}
          {mediaPreview && (
            <div className="px-3 sm:px-4 py-2 border-t border-border bg-muted/50">
              <div className="flex items-center gap-3">
                {mediaPreview.type === 'image' && mediaPreview.previewUrl && (
                  <img 
                    src={mediaPreview.previewUrl} 
                    alt="Preview" 
                    className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg"
                  />
                )}
                {mediaPreview.type === 'document' && (
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
                  </div>
                )}
                {mediaPreview.type === 'audio' && (
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-lg flex items-center justify-center">
                    <Mic className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" />
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

          {/* Recording indicator */}
          {isRecording && (
            <div className="px-3 sm:px-4 py-3 border-t border-border bg-destructive/10 flex items-center gap-3">
              <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
              <span className="text-sm font-medium text-destructive">
                Gravando... {formatRecordingTime(recordingTime)}
              </span>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={cancelRecording}>
                <X className="w-4 h-4 mr-1" />
                Cancelar
              </Button>
            </div>
          )}

          {/* Message Input */}
          <div className="p-2 sm:p-4 border-t border-border">
            <div className="flex items-end gap-1 sm:gap-2">
              <Button variant="ghost" size="icon" className="shrink-0 hidden sm:flex">
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
                  </div>
                </PopoverContent>
              </Popover>
              
              {!isRecording ? (
                <>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="shrink-0"
                    onClick={handleStartRecording}
                    disabled={!!mediaPreview}
                  >
                    <Mic className="w-5 h-5 text-green-500" />
                  </Button>
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
                    className="min-h-[40px] sm:min-h-[44px] max-h-32 resize-none text-sm"
                    rows={1}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  Clique no botão azul para enviar
                </div>
              )}
              
              <Button 
                size="icon" 
                className="shrink-0 bg-accent hover:bg-accent/90"
                onClick={handleSendMessage}
                disabled={(!messageText.trim() && !mediaPreview && !isRecording) || sendMessage.isPending || isUploading}
              >
                {(sendMessage.isPending || isUploading) ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={cn(
          "flex-1 flex items-center justify-center text-muted-foreground",
          !showMobileChat && "hidden md:flex"
        )}>
          Selecione uma conversa para começar
        </div>
      )}

      {/* Contact Profile Panel */}
      {showProfilePanel && selectedConversation?.contact?.id && (
        <ContactProfilePanel
          contactId={selectedConversation.contact.id}
          onClose={() => setShowProfilePanel(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conversa? Esta ação não pode ser desfeita e todas as mensagens serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConversation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
