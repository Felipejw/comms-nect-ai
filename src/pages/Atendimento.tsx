import { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from "react";
import { Search, Filter, MoreVertical, Send, Smile, Paperclip, CheckCircle, Loader2, MessageCircle, Image, FileText, Mic, X, User, Trash2, Check, CheckCheck, Tag, ChevronUp, ChevronDown, Bell, BellOff, ArrowLeft, Video, Calendar, MoreHorizontal, Bot, UserCheck } from "lucide-react";
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useConversations, useMessages, useSendMessage, useUpdateConversation, useDeleteConversation, useMarkConversationAsRead, Conversation, Message } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useQuickReplies, QuickReply } from "@/hooks/useQuickReplies";
import { useTags } from "@/hooks/useTags";
import { useConversationTags, useAddTagToConversation, useRemoveTagFromConversation } from "@/hooks/useConversationTags";
import { useNotifications } from "@/hooks/useNotifications";
import { useCreateSchedule } from "@/hooks/useSchedules";
import ContactProfilePanel from "@/components/atendimento/ContactProfilePanel";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useContactOnlineStatus } from "@/hooks/useContactOnlineStatus";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Template variable replacement helper
const replaceTemplateVariables = (
  text: string, 
  contact?: { name?: string | null; phone?: string | null; company?: string | null },
  attendantName?: string
): string => {
  const now = new Date();
  return text
    .replace(/{nome}/gi, contact?.name || 'Cliente')
    .replace(/{telefone}/gi, contact?.phone || '')
    .replace(/{empresa}/gi, contact?.company || '')
    .replace(/{data}/gi, format(now, 'dd/MM/yyyy', { locale: ptBR }))
    .replace(/{hora}/gi, format(now, 'HH:mm'))
    .replace(/{atendente}/gi, attendantName || 'Atendente');
};

const statusConfig = {
  new: { label: "Novo", className: "bg-primary/10 text-primary" },
  in_progress: { label: "Em Atendimento", className: "bg-warning/10 text-warning" },
  resolved: { label: "Resolvido", className: "bg-success/10 text-success" },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground" },
};

interface MediaPreview {
  file: File;
  type: 'image' | 'document' | 'audio' | 'video';
  previewUrl?: string;
}

export default function Atendimento() {
  const [activeTab, setActiveTab] = useState<'attending' | 'completed' | 'chatbot'>('attending');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  
  // Message search state
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  
  // Quick replies state
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(0);
  
  // Tags state
  const [showTagPopover, setShowTagPopover] = useState(false);
  
  // Schedule dialog state
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  
  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageSearchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: messages, isLoading: messagesLoading } = useMessages(selectedConversation?.id || "");
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();
  const deleteConversation = useDeleteConversation();
  const markAsRead = useMarkConversationAsRead();
  const uploadFile = useFileUpload();
  const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
  const { data: quickReplies } = useQuickReplies();
  const { data: tags } = useTags();
  const { data: conversationTags } = useConversationTags(selectedConversation?.id);
  const addTagToConversation = useAddTagToConversation();
  const removeTagFromConversation = useRemoveTagFromConversation();
  const { requestPermission, showNotification, permission } = useNotifications();
  const createSchedule = useCreateSchedule();
  
  // Typing indicator
  const { typingUsers, handleTyping, stopTyping } = useTypingIndicator(
    selectedConversation?.id || '',
    user?.id || '',
    profile?.name || 'Atendente'
  );
  
  // Contact online status (for WhatsApp contacts)
  const { isOnline: contactIsOnline, lastSeen: contactLastSeen, isLoading: statusLoading } = useContactOnlineStatus(
    selectedConversation?.channel === 'whatsapp' ? selectedConversation?.contact?.phone : null
  );
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Listen for new messages and show notifications
  useEffect(() => {
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender_type === 'contact' && !lastMessage.is_read) {
        const contactName = selectedConversation?.contact?.name || 'Contato';
        showNotification(
          `Nova mensagem de ${contactName}`,
          lastMessage.content.substring(0, 100),
          selectedConversation?.contact?.avatar_url || undefined
        );
      }
    }
  }, [messages?.length]);

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedConversation && selectedConversation.unread_count > 0) {
      markAsRead.mutate(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  // Filtered quick replies based on input
  const filteredQuickReplies = useMemo(() => {
    if (!showQuickReplies || !quickReplies) return [];
    const query = messageText.slice(1).toLowerCase();
    return quickReplies.filter(qr =>
      qr.shortcut.toLowerCase().includes(query) ||
      qr.title.toLowerCase().includes(query)
    ).slice(0, 5);
  }, [messageText, showQuickReplies, quickReplies]);

  // Search results in messages
  const searchResults = useMemo(() => {
    if (!messageSearchQuery.trim() || !messages) return [];
    const query = messageSearchQuery.toLowerCase();
    return messages.filter(m => 
      m.content.toLowerCase().includes(query)
    );
  }, [messages, messageSearchQuery]);

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

  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.filter((c) => {
      // Search filter
      const name = c.contact?.name?.toLowerCase() || "";
      const phone = c.contact?.phone?.toLowerCase() || "";
      const query = searchQuery.toLowerCase();
      const matchesSearch = name.includes(query) || phone.includes(query);
      
      // Tab filter
      let matchesTab = false;
      if (activeTab === 'attending') {
        // Atendendo: manual attendance (is_bot_active = false) AND status is new or in_progress
        matchesTab = !c.is_bot_active && (c.status === 'new' || c.status === 'in_progress');
      } else if (activeTab === 'completed') {
        // Concluído: status is resolved
        matchesTab = c.status === 'resolved';
      } else if (activeTab === 'chatbot') {
        // Chatbot: is_bot_active = true AND status is not resolved/archived
        matchesTab = c.is_bot_active && c.status !== 'resolved' && c.status !== 'archived';
      }
      
      // Status filter (additional filter within tab)
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(c.status);
      
      // Tag filter (we need to check conversation tags)
      // For now, we'll include all if no tag filter, otherwise we need to check
      const matchesTags = tagFilter.length === 0;
      
      return matchesSearch && matchesTab && matchesStatus && matchesTags;
    });
  }, [conversations, searchQuery, activeTab, statusFilter, tagFilter]);

  // Tab counts
  const tabCounts = useMemo(() => {
    if (!conversations) return { attending: 0, completed: 0, chatbot: 0 };
    return {
      attending: conversations.filter(c => !c.is_bot_active && (c.status === 'new' || c.status === 'in_progress')).length,
      completed: conversations.filter(c => c.status === 'resolved').length,
      chatbot: conversations.filter(c => c.is_bot_active && c.status !== 'resolved' && c.status !== 'archived').length,
    };
  }, [conversations]);

  const activeFiltersCount = statusFilter.length + tagFilter.length;

  const clearFilters = () => {
    setStatusFilter([]);
    setTagFilter([]);
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const toggleTagFilter = (tagId: string) => {
    setTagFilter(prev => 
      prev.includes(tagId) 
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!showMessageSearch) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showMessageSearch]);

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
    setShowMessageSearch(false);
    setMessageSearchQuery("");
  }, [selectedConversation?.id]);

  // Focus search input when opened
  useEffect(() => {
    if (showMessageSearch) {
      messageSearchInputRef.current?.focus();
    }
  }, [showMessageSearch]);

  // Scroll to search result
  useEffect(() => {
    if (searchResults.length > 0 && currentSearchIndex < searchResults.length) {
      const messageId = searchResults[currentSearchIndex].id;
      const element = messageRefs.current.get(messageId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSearchIndex, searchResults]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>, type: 'image' | 'document' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = type === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "Arquivo muito grande",
        description: `O arquivo deve ter no máximo ${type === 'video' ? '50MB' : '10MB'}`,
        variant: "destructive",
      });
      return;
    }

    const previewUrl = (type === 'image' || type === 'video') ? URL.createObjectURL(file) : undefined;
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
        content: messageText.trim() || (mediaPreview?.type === 'image' ? '📷 Imagem' : mediaPreview?.type === 'video' ? '🎬 Vídeo' : mediaPreview?.file.name || ''),
        senderId: user.id,
        senderType: "agent",
        sendViaWhatsApp: isWhatsApp,
        messageType: mediaPreview?.type || 'text',
        mediaUrl,
      });

      setMessageText("");
      clearMediaPreview();
      stopTyping(); // Stop typing indicator when message is sent

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

  const handleTextChange = (value: string) => {
    setMessageText(value);
    
    // Trigger typing indicator
    if (value.length > 0) {
      handleTyping();
    }
    
    if (value.startsWith('/') && value.length >= 1) {
      setShowQuickReplies(true);
      setSelectedQuickReplyIndex(0);
    } else {
      setShowQuickReplies(false);
    }
  };

  const insertQuickReply = (reply: QuickReply) => {
    const processedMessage = replaceTemplateVariables(
      reply.message,
      selectedConversation?.contact,
      profile?.name
    );
    setMessageText(processedMessage);
    setShowQuickReplies(false);
  };

  const handleEmojiSelect = (emoji: any) => {
    setMessageText(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showQuickReplies && filteredQuickReplies.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedQuickReplyIndex(i => Math.min(i + 1, filteredQuickReplies.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedQuickReplyIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertQuickReply(filteredQuickReplies[selectedQuickReplyIndex]);
      } else if (e.key === 'Escape') {
        setShowQuickReplies(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAddTag = (tagId: string) => {
    if (!selectedConversation) return;
    addTagToConversation.mutate({ conversationId: selectedConversation.id, tagId });
  };

  const handleRemoveTag = (tagId: string) => {
    if (!selectedConversation) return;
    removeTagFromConversation.mutate({ conversationId: selectedConversation.id, tagId });
  };

  const navigateSearchResult = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    if (direction === 'next') {
      setCurrentSearchIndex(i => (i + 1) % searchResults.length);
    } else {
      setCurrentSearchIndex(i => (i - 1 + searchResults.length) % searchResults.length);
    }
  };

  const formatTime = (date: string) => {
    return format(new Date(date), "HH:mm", { locale: ptBR });
  };

  const formatRelativeTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded">{part}</mark> 
        : part
    );
  };

  const renderDeliveryStatus = (message: Message) => {
    if (message.sender_type !== 'agent') return null;

    const status = message.delivery_status || 'sent';
    
    switch (status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-primary" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'sent':
      default:
        return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const renderMessage = (message: Message) => {
    const isOutgoing = message.sender_type === "agent";
    const isSearchResult = searchResults.some(r => r.id === message.id);
    const isCurrentResult = searchResults[currentSearchIndex]?.id === message.id;
    
    return (
      <div
        key={message.id}
        ref={(el) => el && messageRefs.current.set(message.id, el)}
        className={cn(
          "flex",
          isOutgoing ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            "max-w-[85%] sm:max-w-[70%]",
            isOutgoing ? "chat-bubble-outgoing" : "chat-bubble-incoming",
            isCurrentResult && "ring-2 ring-primary ring-offset-2"
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
          {message.message_type === "video" && message.media_url && (
            <video 
              controls 
              className="rounded-lg max-w-full mb-2"
              style={{ maxHeight: '300px' }}
            >
              <source src={message.media_url} />
              Seu navegador não suporta vídeos.
            </video>
          )}
          {message.content && (
            <p className="text-sm break-words">
              {messageSearchQuery ? highlightText(message.content, messageSearchQuery) : message.content}
            </p>
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

  // Get available tags (not already added to conversation)
  const availableTags = useMemo(() => {
    if (!tags || !conversationTags) return tags || [];
    const addedTagIds = new Set(conversationTags.map(ct => ct.tag_id));
    return tags.filter(t => !addedTagIds.has(t.id));
  }, [tags, conversationTags]);

  if (conversationsLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
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
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'video')}
      />

      {/* Contact List */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 border-r border-border flex flex-col",
        showMobileChat && "hidden md:flex"
      )}>
        {/* Category Tabs */}
        <div className="p-2 border-b border-border">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'attending' | 'completed' | 'chatbot')} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="attending" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <UserCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Atendendo</span>
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] h-4 min-w-[18px]">
                  {tabCounts.attending}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Concluído</span>
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] h-4 min-w-[18px]">
                  {tabCounts.completed}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="chatbot" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chatbot</span>
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] h-4 min-w-[18px]">
                  {tabCounts.chatbot}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
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
            <Popover open={showFilterPopover} onOpenChange={setShowFilterPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 relative">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtrar
                  {activeFiltersCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 w-5 h-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">Filtros</p>
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>
                        Limpar
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Status</p>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox 
                          checked={statusFilter.includes(key)}
                          onCheckedChange={() => toggleStatusFilter(key)}
                        />
                        <Badge className={cn("text-xs", config.className)}>
                          {config.label}
                        </Badge>
                      </label>
                    ))}
                  </div>
                  
                  {tags && tags.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Tags</p>
                      {tags.map(tag => (
                        <label key={tag.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox 
                            checked={tagFilter.includes(tag.id)}
                            onCheckedChange={() => toggleTagFilter(tag.id)}
                          />
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm">{tag.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant={permission === 'granted' ? 'outline' : 'default'}
              size="sm"
              onClick={requestPermission}
              title={permission === 'granted' ? 'Notificações ativadas' : 'Ativar notificações'}
            >
              {permission === 'granted' ? (
                <Bell className="w-4 h-4 text-accent" />
              ) : (
                <BellOff className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {/* Active filters chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {statusFilter.map(status => (
                <Badge 
                  key={status} 
                  variant="secondary" 
                  className="text-xs gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => toggleStatusFilter(status)}
                >
                  {statusConfig[status as keyof typeof statusConfig].label}
                  <X className="w-3 h-3" />
                </Badge>
              ))}
              {tagFilter.map(tagId => {
                const tag = tags?.find(t => t.id === tagId);
                return tag ? (
                  <Badge 
                    key={tagId} 
                    style={{ backgroundColor: tag.color }}
                    className="text-white text-xs gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => toggleTagFilter(tagId)}
                  >
                    {tag.name}
                    <X className="w-3 h-3" />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
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
                  <p className="text-sm text-muted-foreground truncate mb-1">
                    {conversation.subject || "Sem assunto"}
                  </p>
                  {conversation.tags && conversation.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {conversation.tags.slice(0, 3).map(tag => (
                        <Badge 
                          key={tag.id}
                          style={{ backgroundColor: tag.color }}
                          className="text-white text-[9px] px-1.5 py-0 h-4"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      {conversation.tags.length > 3 && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                          +{conversation.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={cn("text-[10px] px-1.5 py-0.5", statusConfig[conversation.status].className)}>
                    {statusConfig[conversation.status].label}
                  </Badge>
                  {conversation.unread_count > 0 && (
                    <Badge className="bg-accent text-accent-foreground w-5 h-5 p-0 flex items-center justify-center rounded-full text-xs">
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
          <div className="border-b border-border px-3 sm:px-4 py-2">
            <div className="flex items-center justify-between gap-2 h-12">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden shrink-0"
                  onClick={() => setShowMobileChat(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
                <div className="relative">
                  <Avatar className="w-8 h-8 sm:w-10 sm:h-10 shrink-0">
                    <AvatarImage src={selectedConversation.contact?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {getInitials(selectedConversation.contact)}
                    </AvatarFallback>
                  </Avatar>
                  {selectedConversation.channel === "whatsapp" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-card",
                              contactIsOnline ? "bg-green-500" : "bg-muted-foreground/50"
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {statusLoading ? (
                            "Verificando..."
                          ) : contactIsOnline ? (
                            "Online agora"
                          ) : contactLastSeen ? (
                            `Visto por último: ${formatDistanceToNow(new Date(contactLastSeen), { addSuffix: true, locale: ptBR })}`
                          ) : (
                            "Offline"
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm sm:text-base truncate">{getDisplayName(selectedConversation.contact)}</p>
                    {selectedConversation.channel === "whatsapp" && contactIsOnline && (
                      <span className="text-[10px] text-green-500 font-medium hidden sm:inline">• online</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground truncate">
                      {formatPhoneDisplay(selectedConversation.contact?.phone) || selectedConversation.contact?.email || "-"}
                    </p>
                    {selectedConversation.channel === "whatsapp" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-accent border-accent/30 hidden sm:flex">
                        <MessageCircle className="w-3 h-3" />
                        WhatsApp
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMessageSearch(!showMessageSearch)}
                  className={cn(showMessageSearch && "bg-primary/10 text-primary")}
                >
                  <Search className="w-4 h-4" />
                </Button>
                <Popover open={showTagPopover} onOpenChange={setShowTagPopover}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Tag className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="end">
                    <div className="space-y-2">
                      <p className="text-sm font-medium px-2">Tags da conversa</p>
                      {conversationTags && conversationTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-2 pb-2 border-b">
                          {conversationTags.map(ct => (
                            <Badge
                              key={ct.id}
                              style={{ backgroundColor: ct.tag?.color }}
                              className="text-white text-xs gap-1 cursor-pointer hover:opacity-80"
                              onClick={() => handleRemoveTag(ct.tag_id)}
                            >
                              {ct.tag?.name}
                              <X className="w-3 h-3" />
                            </Badge>
                          ))}
                        </div>
                      )}
                      {availableTags && availableTags.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground px-2">Adicionar tag:</p>
                          {availableTags.map(tag => (
                            <Button
                              key={tag.id}
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2"
                              onClick={() => handleAddTag(tag.id)}
                            >
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Todas as tags já foram adicionadas
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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
                      <DropdownMenuItem onClick={handleResolve} disabled={updateConversation.isPending}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Resolver conversa
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowMessageSearch(true)}>
                      <Search className="w-4 h-4 mr-2" />
                      Buscar mensagens
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowTagPopover(true)}>
                      <Tag className="w-4 h-4 mr-2" />
                      Gerenciar tags
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowScheduleDialog(true)}>
                      <Calendar className="w-4 h-4 mr-2" />
                      Agendar mensagem
                    </DropdownMenuItem>
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
            
            {/* Tags display */}
            {conversationTags && conversationTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {conversationTags.map(ct => (
                  <Badge
                    key={ct.id}
                    style={{ backgroundColor: ct.tag?.color }}
                    className="text-white text-[10px] px-1.5 py-0"
                  >
                    {ct.tag?.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Message Search Bar */}
          {showMessageSearch && (
            <div className="px-3 sm:px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                ref={messageSearchInputRef}
                placeholder="Buscar nas mensagens..."
                value={messageSearchQuery}
                onChange={(e) => {
                  setMessageSearchQuery(e.target.value);
                  setCurrentSearchIndex(0);
                }}
                className="h-8 text-sm"
              />
              {searchResults.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {currentSearchIndex + 1}/{searchResults.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigateSearchResult('prev')}>
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigateSearchResult('next')}>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => {
                setShowMessageSearch(false);
                setMessageSearchQuery("");
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/30 scrollbar-thin">
            {messagesLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : messages && messages.length > 0 ? (
              <>
                {messages.map(renderMessage)}
                
                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="flex justify-start">
                    <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
                      </div>
                      <span className="text-xs text-muted-foreground ml-1">
                        {typingUsers.length === 1 
                          ? `${typingUsers[0].name} está digitando...`
                          : `${typingUsers.length} pessoas digitando...`
                        }
                      </span>
                    </div>
                  </div>
                )}
                
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
                    <Mic className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
                  </div>
                )}
                {mediaPreview.type === 'video' && mediaPreview.previewUrl && (
                  <video 
                    src={mediaPreview.previewUrl} 
                    className="w-16 h-16 object-cover rounded-lg"
                  />
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

          {/* Quick Replies Dropdown */}
          {showQuickReplies && filteredQuickReplies.length > 0 && (
            <div className="px-3 sm:px-4 border-t border-border">
              <div className="bg-popover rounded-lg border shadow-lg max-h-48 overflow-y-auto">
                {filteredQuickReplies.map((reply, index) => (
                  <button
                    key={reply.id}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted transition-colors",
                      index === selectedQuickReplyIndex && "bg-muted"
                    )}
                    onClick={() => insertQuickReply(reply)}
                    onMouseEnter={() => setSelectedQuickReplyIndex(index)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        /{reply.shortcut}
                      </span>
                      <span className="text-sm font-medium truncate">{reply.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{reply.message}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Input */}
          <div className="p-2 sm:p-4 border-t border-border">
            <div className="flex items-end gap-1 sm:gap-2">
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 hidden sm:flex">
                    <Smile className="w-5 h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-0" align="start" side="top">
                  <Picker 
                    data={data} 
                    onEmojiSelect={handleEmojiSelect} 
                    locale="pt" 
                    theme="auto"
                    previewPosition="none"
                  />
                </PopoverContent>
              </Popover>
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
                      <Image className="w-4 h-4 text-primary" />
                      Imagem
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-2"
                      onClick={() => videoInputRef.current?.click()}
                    >
                      <Video className="w-4 h-4 text-accent" />
                      Vídeo
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileText className="w-4 h-4 text-warning" />
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
                    <Mic className="w-5 h-5 text-accent" />
                  </Button>
                  <div className="flex-1 relative">
                    <Textarea
                      placeholder="Digite / para respostas rápidas..."
                      value={messageText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="min-h-[40px] sm:min-h-[44px] max-h-32 resize-none text-sm"
                      rows={1}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  Clique no botão verde para enviar
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

      {/* Schedule Message Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-sm font-medium">Contato</p>
              <p className="text-sm text-muted-foreground">
                {selectedConversation?.contact?.name || "Sem nome"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input 
                placeholder="Ex: Follow-up do pedido" 
                value={scheduleTitle}
                onChange={(e) => setScheduleTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                placeholder="Detalhes do agendamento" 
                value={scheduleDescription}
                onChange={(e) => setScheduleDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input 
                  type="date" 
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário *</Label>
                <Input 
                  type="time" 
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (!scheduleTitle.trim() || !scheduleDate || !scheduleTime || !user?.id || !selectedConversation) return;
                const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
                await createSchedule.mutateAsync({
                  title: scheduleTitle.trim(),
                  description: scheduleDescription.trim() || null,
                  contact_id: selectedConversation.contact_id,
                  user_id: user.id,
                  scheduled_at: scheduledAt.toISOString(),
                  reminder: true,
                });
                setScheduleTitle("");
                setScheduleDescription("");
                setScheduleDate("");
                setScheduleTime("");
                setShowScheduleDialog(false);
              }}
              disabled={createSchedule.isPending || !scheduleTitle.trim() || !scheduleDate || !scheduleTime}
            >
              {createSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
