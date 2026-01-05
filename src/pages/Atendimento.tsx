import { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from "react";
import { Search, Filter, MoreVertical, Send, Smile, Paperclip, CheckCircle, Loader2, MessageCircle, Image, FileText, Mic, X, User, Trash2, Check, CheckCheck, Tag, ChevronUp, ChevronDown, ArrowLeft, Video, Calendar, MoreHorizontal, Bot, UserCheck, Building, PenLine, CheckSquare, Archive, Download } from "lucide-react";
import { AudioPlayer } from "@/components/atendimento/AudioPlayer";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useFlows } from "@/hooks/useFlows";
import { useQueues } from "@/hooks/useQueues";
import { useBulkDeleteConversations, useBulkUpdateConversations, useBulkAddTagsToConversations, useBulkRemoveTagsFromConversations, useExportConversations } from "@/hooks/useBulkConversationActions";
import ContactProfilePanel from "@/components/atendimento/ContactProfilePanel";
import { ChatConnectionIndicator } from "@/components/atendimento/ChatConnectionIndicator";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useContactOnlineStatus } from "@/hooks/useContactOnlineStatus";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useUsers } from "@/hooks/useUsers";

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

// Helper to normalize phone for search
const normalizePhone = (phone: string) => {
  return phone.replace(/\D/g, '');
};

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
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  
  // Transfer to bot dialog state
  const [showBotFlowDialog, setShowBotFlowDialog] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  
  // Change queue dialog state
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  
  // Signature toggle state
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  
  // Bulk selection state
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>("");
  const [bulkAssignValue, setBulkAssignValue] = useState<string>("");
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [selectedBulkTags, setSelectedBulkTags] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  
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
  const { data: flows } = useFlows();
  const { data: queues } = useQueues();
  const { data: users } = useUsers();
  const bulkDeleteConversations = useBulkDeleteConversations();
  const bulkUpdateConversations = useBulkUpdateConversations();
  const bulkAddTags = useBulkAddTagsToConversations();
  const bulkRemoveTags = useBulkRemoveTagsFromConversations();
  const exportConversations = useExportConversations();
  
  // Active flows for bot transfer
  const activeFlows = useMemo(() => flows?.filter(f => f.is_active) || [], [flows]);
  
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
      // Search filter - includes phone number search
      const name = c.contact?.name?.toLowerCase() || "";
      const phone = c.contact?.phone || "";
      const normalizedPhone = normalizePhone(phone);
      const query = searchQuery.toLowerCase();
      const normalizedQuery = normalizePhone(searchQuery);
      
      // Match by name or phone (both formatted and normalized)
      const matchesSearch = name.includes(query) || 
                           phone.toLowerCase().includes(query) ||
                           normalizedPhone.includes(normalizedQuery);
      
      // Tab filter
      let matchesTab = false;
      if (activeTab === 'attending') {
        matchesTab = !c.is_bot_active && (c.status === 'new' || c.status === 'in_progress');
      } else if (activeTab === 'completed') {
        matchesTab = c.status === 'resolved';
      } else if (activeTab === 'chatbot') {
        matchesTab = c.is_bot_active && c.status !== 'resolved' && c.status !== 'archived';
      }
      
      // Status filter
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(c.status);
      
      // Tag filter
      const matchesTags = tagFilter.length === 0;
      
      // Queue filter
      const matchesQueue = queueFilter === 'all' || c.queue_id === queueFilter;
      
      return matchesSearch && matchesTab && matchesStatus && matchesTags && matchesQueue;
    });
  }, [conversations, searchQuery, activeTab, statusFilter, tagFilter, queueFilter]);

  // Tab counts
  const tabCounts = useMemo(() => {
    if (!conversations) return { attending: 0, completed: 0, chatbot: 0 };
    return {
      attending: conversations.filter(c => !c.is_bot_active && (c.status === 'new' || c.status === 'in_progress')).length,
      completed: conversations.filter(c => c.status === 'resolved').length,
      chatbot: conversations.filter(c => c.is_bot_active && c.status !== 'resolved' && c.status !== 'archived').length,
    };
  }, [conversations]);

  const activeFiltersCount = statusFilter.length + tagFilter.length + (queueFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter([]);
    setTagFilter([]);
    setQueueFilter("all");
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

  // Bulk selection functions
  const toggleBulkSelectionMode = () => {
    setBulkSelectionMode(!bulkSelectionMode);
    setSelectedConversationIds(new Set());
  };

  const toggleConversationSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedConversationIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedConversationIds.size === filteredConversations.length) {
      setSelectedConversationIds(new Set());
    } else {
      setSelectedConversationIds(new Set(filteredConversations.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    await bulkDeleteConversations.mutateAsync(Array.from(selectedConversationIds));
    setSelectedConversationIds(new Set());
    setBulkSelectionMode(false);
    setShowBulkDeleteDialog(false);
    setSelectedConversation(null);
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatusValue) return;
    await bulkUpdateConversations.mutateAsync({
      ids: Array.from(selectedConversationIds),
      updates: { status: bulkStatusValue as "new" | "in_progress" | "resolved" | "archived" }
    });
    setSelectedConversationIds(new Set());
    setBulkSelectionMode(false);
    setShowBulkStatusDialog(false);
    setBulkStatusValue("");
  };

  const handleBulkAssign = async () => {
    await bulkUpdateConversations.mutateAsync({
      ids: Array.from(selectedConversationIds),
      updates: { assigned_to: bulkAssignValue === "none" ? null : bulkAssignValue || null }
    });
    setSelectedConversationIds(new Set());
    setBulkSelectionMode(false);
    setShowBulkAssignDialog(false);
    setBulkAssignValue("");
  };

  const handleBulkResolve = async () => {
    await bulkUpdateConversations.mutateAsync({
      ids: Array.from(selectedConversationIds),
      updates: { status: "resolved" }
    });
    setSelectedConversationIds(new Set());
    setBulkSelectionMode(false);
  };

  const handleBulkArchive = async () => {
    await bulkUpdateConversations.mutateAsync({
      ids: Array.from(selectedConversationIds),
      updates: { status: "archived" }
    });
    setSelectedConversationIds(new Set());
    setBulkSelectionMode(false);
  };

  const handleBulkTagAction = async () => {
    if (selectedBulkTags.size === 0) return;
    const tagIds = Array.from(selectedBulkTags);
    const conversationIds = Array.from(selectedConversationIds);
    
    if (bulkTagMode === 'add') {
      await bulkAddTags.mutateAsync({ conversationIds, tagIds });
    } else {
      await bulkRemoveTags.mutateAsync({ conversationIds, tagIds });
    }
    
    setSelectedBulkTags(new Set());
    setShowBulkTagDialog(false);
    setSelectedConversationIds(new Set());
    setBulkSelectionMode(false);
  };

  const handleExport = async () => {
    await exportConversations.mutateAsync({
      conversationIds: Array.from(selectedConversationIds),
      format: exportFormat
    });
    setShowExportDialog(false);
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
      // Determine file extension based on blob type
      const blobType = audioBlob.type || 'audio/webm';
      const extension = blobType.includes('mp4') ? 'mp4' : blobType.includes('ogg') ? 'ogg' : 'webm';
      const audioFile = new File([audioBlob], `audio_${Date.now()}.${extension}`, { type: blobType });
      console.log('[Atendimento] Sending audio with type:', blobType, 'extension:', extension);
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

      // Format content with signature if enabled
      let finalContent = messageText.trim() || (mediaPreview?.type === 'image' ? '📷 Imagem' : mediaPreview?.type === 'video' ? '🎬 Vídeo' : mediaPreview?.file.name || '');
      
      // Add signature if enabled and there's text content
      if (signatureEnabled && messageText.trim() && isWhatsApp) {
        const attendantName = profile?.name || 'Atendente';
        finalContent = `*${attendantName}:* ${messageText.trim()}`;
      }

      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        content: finalContent,
        senderId: user.id,
        senderType: "agent",
        sendViaWhatsApp: isWhatsApp,
        messageType: mediaPreview?.type || 'text',
        mediaUrl,
      });

      setMessageText("");
      clearMediaPreview();
      stopTyping();

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

  const handleTransferToManual = async () => {
    if (!selectedConversation || !user) return;
    
    await updateConversation.mutateAsync({
      id: selectedConversation.id,
      is_bot_active: false,
      assigned_to: user.id,
      status: selectedConversation.status === 'new' ? 'in_progress' : selectedConversation.status,
    });
    
    toast({
      title: "Conversa transferida",
      description: "A conversa foi transferida para atendimento manual",
    });
  };

  const handleTransferToBot = async () => {
    if (!selectedConversation) return;
    
    // If there are active flows, show selection dialog
    if (activeFlows.length > 0) {
      setSelectedFlowId(activeFlows[0].id);
      setShowBotFlowDialog(true);
      return;
    }
    
    // No flows available, transfer without flow
    await updateConversation.mutateAsync({
      id: selectedConversation.id,
      is_bot_active: true,
      assigned_to: null,
    });
    
    toast({
      title: "Conversa transferida",
      description: "A conversa foi transferida para o Chatbot",
    });
  };

  const confirmTransferToBot = async () => {
    if (!selectedConversation) return;
    
    await updateConversation.mutateAsync({
      id: selectedConversation.id,
      is_bot_active: true,
      assigned_to: null,
      active_flow_id: selectedFlowId || null,
    });
    
    setShowBotFlowDialog(false);
    setSelectedFlowId("");
    
    const selectedFlow = activeFlows.find(f => f.id === selectedFlowId);
    toast({
      title: "Conversa transferida",
      description: selectedFlow 
        ? `A conversa foi transferida para o fluxo "${selectedFlow.name}"` 
        : "A conversa foi transferida para o Chatbot",
    });
  };

  const handleChangeQueue = async () => {
    if (!selectedConversation) return;
    setSelectedQueueId(selectedConversation.queue_id || "");
    setShowQueueDialog(true);
  };

  const confirmChangeQueue = async () => {
    if (!selectedConversation) return;
    
    const queueId = selectedQueueId === 'none' ? null : selectedQueueId;
    
    await updateConversation.mutateAsync({
      id: selectedConversation.id,
      queue_id: queueId,
    });
    
    setShowQueueDialog(false);
    
    const selectedQueue = queues?.find(q => q.id === queueId);
    toast({
      title: "Setor alterado",
      description: selectedQueue 
        ? `A conversa foi movida para "${selectedQueue.name}"` 
        : "A conversa foi removida do setor",
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
            <AudioPlayer src={message.media_url} className="mb-2" />
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-[calc(100vh-3rem)] -m-4 md:-m-6 bg-card border border-border overflow-hidden shadow-sm">
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
        <div className="p-3 sm:p-4 border-b border-border space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 input-search"
            />
          </div>
          
          {/* Filter button */}
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
                  
                  {/* Queue/Sector filter */}
                  {queues && queues.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Setor</p>
                      <Select value={queueFilter} onValueChange={setQueueFilter}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Todos os setores" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os setores</SelectItem>
                          {queues.map(queue => (
                            <SelectItem key={queue.id} value={queue.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: queue.color }}
                                />
                                {queue.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
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
              variant={bulkSelectionMode ? "secondary" : "outline"}
              size="sm"
              onClick={toggleBulkSelectionMode}
              title={bulkSelectionMode ? "Cancelar seleção" : "Selecionar conversas"}
            >
              {bulkSelectionMode ? (
                <X className="w-4 h-4" />
              ) : (
                <CheckSquare className="w-4 h-4" />
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
              {queueFilter !== 'all' && (
                <Badge 
                  variant="secondary" 
                  className="text-xs gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => setQueueFilter("all")}
                >
                  {queues?.find(q => q.id === queueFilter)?.name}
                  <X className="w-3 h-3" />
                </Badge>
              )}
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
          
          {/* Tabs - Moved below filter */}
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
          
          {/* Quick Sector Filter */}
          {queues && queues.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
              <Badge 
                variant={queueFilter === 'all' ? 'default' : 'outline'}
                className="cursor-pointer shrink-0 text-xs px-2 py-0.5"
                onClick={() => setQueueFilter('all')}
              >
                Todos
              </Badge>
              {queues.map(queue => (
                <Badge 
                  key={queue.id}
                  variant={queueFilter === queue.id ? 'default' : 'outline'}
                  className="cursor-pointer shrink-0 text-xs px-2 py-0.5 gap-1"
                  style={queueFilter === queue.id ? { backgroundColor: queue.color || '#6366f1' } : { borderColor: queue.color || '#6366f1', color: queue.color || '#6366f1' }}
                  onClick={() => setQueueFilter(queueFilter === queue.id ? 'all' : queue.id)}
                >
                  <div 
                    className="w-2 h-2 rounded-full shrink-0" 
                    style={{ backgroundColor: queueFilter === queue.id ? 'white' : queue.color || '#6366f1' }}
                  />
                  {queue.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Bulk Selection Bar */}
        {bulkSelectionMode && (
          <div className="p-3 bg-primary/10 border-b border-border">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedConversationIds.size === filteredConversations.length && filteredConversations.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium">
                  {selectedConversationIds.size} selecionada(s)
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={toggleBulkSelectionMode}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {selectedConversationIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => setShowBulkDeleteDialog(true)}
                  disabled={bulkDeleteConversations.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Excluir
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleBulkResolve}
                  disabled={bulkUpdateConversations.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Resolver
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleBulkArchive}
                  disabled={bulkUpdateConversations.isPending}
                >
                  <Archive className="w-4 h-4 mr-1" />
                  Arquivar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowExportDialog(true)}
                  disabled={exportConversations.isPending}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Exportar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="w-4 h-4 mr-1" />
                      Mais
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setShowBulkStatusDialog(true)}>
                      Alterar Status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowBulkAssignDialog(true)}>
                      Atribuir Agente
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {
                      setBulkTagMode('add');
                      setSelectedBulkTags(new Set());
                      setShowBulkTagDialog(true);
                    }}>
                      <Tag className="w-4 h-4 mr-2" />
                      Adicionar Tags
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setBulkTagMode('remove');
                      setSelectedBulkTags(new Set());
                      setShowBulkTagDialog(true);
                    }}>
                      <Tag className="w-4 h-4 mr-2" />
                      Remover Tags
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => !bulkSelectionMode && handleSelectConversation(conversation)}
                className={cn(
                  "flex items-stretch border-b border-border cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedConversation?.id === conversation.id && !bulkSelectionMode && "bg-primary/5 hover:bg-primary/10",
                  selectedConversationIds.has(conversation.id) && "bg-primary/5"
                )}
              >
                {/* Connection color line */}
                <div 
                  className="w-1 shrink-0 rounded-l"
                  style={{ backgroundColor: conversation.connection?.color || '#22c55e' }}
                />
                
                <div className="flex items-center gap-3 p-3 flex-1 min-w-0">
                  {bulkSelectionMode && (
                    <Checkbox
                      checked={selectedConversationIds.has(conversation.id)}
                      onCheckedChange={() => toggleConversationSelection(conversation.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                  )}
                  
                  <div className="relative shrink-0">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={conversation.contact?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                        {getInitials(conversation.contact)}
                      </AvatarFallback>
                    </Avatar>
                    {conversation.is_bot_active && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <Bot className="w-2.5 h-2.5 text-primary-foreground" />
                      </span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-medium text-sm truncate">{getDisplayName(conversation.contact)}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {conversation.last_message_at 
                          ? format(new Date(conversation.last_message_at), "HH:mm", { locale: ptBR })
                          : ""
                        }
                      </span>
                    </div>
                    
                    <p className="text-xs text-muted-foreground truncate mb-1.5">
                      {conversation.subject || "Nova conversa"}
                    </p>
                    
                    <div className="flex items-center gap-1 flex-wrap">
                      {/* Queue/Sector Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Badge 
                            style={{ backgroundColor: conversation.queue?.color || '#6366f1' }}
                            className="text-white text-[9px] px-1.5 py-0 h-4 cursor-pointer hover:opacity-80"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Building className="w-2.5 h-2.5 mr-0.5" />
                            {conversation.queue?.name || 'Setor'}
                            <ChevronDown className="w-2.5 h-2.5 ml-0.5" />
                          </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40 bg-popover z-[60]" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem 
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateConversation.mutate({ id: conversation.id, queue_id: null });
                            }}
                          >
                            <X className="w-3 h-3 mr-2" />
                            Sem setor
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {queues?.map(queue => (
                            <DropdownMenuItem 
                              key={queue.id}
                              className="text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateConversation.mutate({ id: conversation.id, queue_id: queue.id });
                              }}
                            >
                              <div 
                                className="w-3 h-3 rounded-full mr-2 shrink-0" 
                                style={{ backgroundColor: queue.color || '#6366f1' }}
                              />
                              {queue.name}
                              {conversation.queue_id === queue.id && (
                                <Check className="w-3 h-3 ml-auto" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
                      {/* Tags */}
                      {conversation.tags && conversation.tags.slice(0, 2).map(tag => (
                        <Badge 
                          key={tag.id}
                          style={{ backgroundColor: tag.color }}
                          className="text-white text-[9px] px-1.5 py-0 h-4"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      
                      {/* Kanban Column (CRM Stage) */}
                      {conversation.kanban_column && (
                        <Badge 
                          variant="outline"
                          style={{ borderColor: conversation.kanban_column.color || '#3B82F6', color: conversation.kanban_column.color || '#3B82F6' }}
                          className="text-[9px] px-1.5 py-0 h-4"
                        >
                          {conversation.kanban_column.name}
                        </Badge>
                      )}
                      
                      {/* Assignee */}
                      {conversation.assignee && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5" />
                          {conversation.assignee.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Unread count */}
                  {conversation.unread_count > 0 && (
                    <Badge className="bg-accent text-accent-foreground w-5 h-5 p-0 flex items-center justify-center rounded-full text-xs shrink-0">
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
                  <ArrowLeft className="w-5 h-5" />
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
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-accent border-accent/30 hidden sm:flex">
                          <MessageCircle className="w-3 h-3" />
                          WhatsApp
                        </Badge>
                        <ChatConnectionIndicator connectionId={selectedConversation.connection_id} />
                      </div>
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
                    <DropdownMenuItem onClick={handleChangeQueue}>
                      <Building className="w-4 h-4 mr-2" />
                      Mudar setor
                    </DropdownMenuItem>
                    {selectedConversation.is_bot_active ? (
                      <DropdownMenuItem onClick={handleTransferToManual} disabled={updateConversation.isPending}>
                        <UserCheck className="w-4 h-4 mr-2" />
                        Assumir atendimento
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={handleTransferToBot} disabled={updateConversation.isPending}>
                        <Bot className="w-4 h-4 mr-2" />
                        Transferir para Bot
                      </DropdownMenuItem>
                    )}
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
              
              {/* Signature Toggle - Only show for WhatsApp conversations */}
              {selectedConversation?.channel === 'whatsapp' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn(
                          "shrink-0 transition-colors",
                          signatureEnabled && "bg-accent/20 text-accent"
                        )}
                        onClick={() => setSignatureEnabled(!signatureEnabled)}
                      >
                        <PenLine className="w-5 h-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{signatureEnabled ? 'Desativar assinatura' : 'Ativar assinatura'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
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

      {/* Contact Profile Panel - Using Sheet on mobile */}
      {showProfilePanel && selectedConversation?.contact?.id && (
        <div className="hidden md:block">
          <ContactProfilePanel
            contactId={selectedConversation.contact.id}
            conversationId={selectedConversation.id}
            onClose={() => setShowProfilePanel(false)}
          />
        </div>
      )}
      
      {/* Mobile Profile Sheet */}
      <Sheet open={showProfilePanel && !!selectedConversation?.contact?.id} onOpenChange={(open) => !open && setShowProfilePanel(false)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 md:hidden">
          {selectedConversation?.contact?.id && (
            <ContactProfilePanel
              contactId={selectedConversation.contact.id}
              conversationId={selectedConversation.id}
              onClose={() => setShowProfilePanel(false)}
            />
          )}
        </SheetContent>
      </Sheet>

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

      {/* Transfer to Bot Flow Dialog */}
      <Dialog open={showBotFlowDialog} onOpenChange={setShowBotFlowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Fluxo do Chatbot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Selecione o fluxo de chatbot para onde a conversa será transferida:
            </p>
            <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um fluxo" />
              </SelectTrigger>
              <SelectContent>
                {activeFlows.map(flow => (
                  <SelectItem key={flow.id} value={flow.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" />
                      {flow.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFlows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nenhum fluxo ativo encontrado
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBotFlowDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmTransferToBot}
              disabled={updateConversation.isPending || !selectedFlowId}
            >
              {updateConversation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Queue Dialog */}
      <Dialog open={showQueueDialog} onOpenChange={setShowQueueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar Setor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Selecione o setor para onde a conversa será movida:
            </p>
            <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
            <SelectContent>
                <SelectItem value="none">Sem setor</SelectItem>
                {queues?.map(queue => (
                  <SelectItem key={queue.id} value={queue.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: queue.color }}
                      />
                      {queue.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQueueDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmChangeQueue}
              disabled={updateConversation.isPending}
            >
              {updateConversation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversas em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedConversationIds.size} conversa(s)? 
              Esta ação não pode ser desfeita e todas as mensagens serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteConversations.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir {selectedConversationIds.size} conversa(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Dialog */}
      <Dialog open={showBulkStatusDialog} onOpenChange={setShowBulkStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status em Massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Alterar o status de {selectedConversationIds.size} conversa(s) para:
            </p>
            <Select value={bulkStatusValue} onValueChange={setBulkStatusValue}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <Badge className={cn("text-xs", config.className)}>
                      {config.label}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkStatusDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBulkStatusUpdate}
              disabled={bulkUpdateConversations.isPending || !bulkStatusValue}
            >
              {bulkUpdateConversations.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={showBulkAssignDialog} onOpenChange={setShowBulkAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Agente em Massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Atribuir {selectedConversationIds.size} conversa(s) para:
            </p>
            <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Sem atribuição</span>
                </SelectItem>
                {users?.map(u => (
                  <SelectItem key={u.id} value={u.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-5 h-5">
                        <AvatarImage src={u.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {u.name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {u.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkAssignDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBulkAssign}
              disabled={bulkUpdateConversations.isPending}
            >
              {bulkUpdateConversations.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={showBulkTagDialog} onOpenChange={setShowBulkTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkTagMode === 'add' ? 'Adicionar Tags em Massa' : 'Remover Tags em Massa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button 
                variant={bulkTagMode === 'add' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBulkTagMode('add')}
              >
                Adicionar Tags
              </Button>
              <Button 
                variant={bulkTagMode === 'remove' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBulkTagMode('remove')}
              >
                Remover Tags
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground">
              {bulkTagMode === 'add' 
                ? `Selecione as tags para adicionar a ${selectedConversationIds.size} conversa(s):`
                : `Selecione as tags para remover de ${selectedConversationIds.size} conversa(s):`
              }
            </p>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {tags?.map(tag => (
                <div key={tag.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                  <Checkbox
                    checked={selectedBulkTags.has(tag.id)}
                    onCheckedChange={(checked) => {
                      setSelectedBulkTags(prev => {
                        const newSet = new Set(prev);
                        if (checked) newSet.add(tag.id);
                        else newSet.delete(tag.id);
                        return newSet;
                      });
                    }}
                  />
                  <Badge style={{ backgroundColor: tag.color }} className="text-white">
                    {tag.name}
                  </Badge>
                  {tag.description && (
                    <span className="text-xs text-muted-foreground">{tag.description}</span>
                  )}
                </div>
              ))}
              {(!tags || tags.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma tag disponível
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkTagDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBulkTagAction}
              disabled={selectedBulkTags.size === 0 || bulkAddTags.isPending || bulkRemoveTags.isPending}
            >
              {(bulkAddTags.isPending || bulkRemoveTags.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {bulkTagMode === 'add' ? 'Adicionar' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar Conversas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Exportar {selectedConversationIds.size} conversa(s) com todas as mensagens
            </p>
            
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as 'csv' | 'pdf')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      CSV (Excel)
                    </div>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      HTML (Relatório para PDF)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExport} disabled={exportConversations.isPending}>
              {exportConversations.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
