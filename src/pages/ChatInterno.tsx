import { useState, useEffect, useRef } from "react";
import { Search, Send, Smile, Paperclip, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { useChatMessages, useSendChatMessage, useMarkMessagesAsRead, useUnreadMessageCounts } from "@/hooks/useChatInterno";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  online: boolean;
  avatar_url: string | null;
}

export default function ChatInterno() {
  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    user?.id || "",
    selectedMember?.id || ""
  );
  const sendMessage = useSendChatMessage();
  const markAsRead = useMarkMessagesAsRead();
  const { data: unreadCounts = {} } = useUnreadMessageCounts(user?.id || "");

  // Transform users to team members (excluding current user)
  const teamMembers: TeamMember[] = users
    .filter(u => u.id !== user?.id)
    .map(u => ({
      id: u.id,
      name: u.name,
      role: u.role === "admin" ? "Administrador" : u.role === "manager" ? "Gestor" : "Operador",
      online: u.is_online || false,
      avatar_url: u.avatar_url,
    }));

  const filteredMembers = teamMembers.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mark messages as read when selecting a member
  useEffect(() => {
    if (selectedMember && user?.id) {
      markAsRead.mutate({ userId: user.id, senderId: selectedMember.id });
    }
  }, [selectedMember?.id, user?.id]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedMember || !user?.id) return;

    await sendMessage.mutateAsync({
      senderId: user.id,
      receiverId: selectedMember.id,
      content: messageText.trim(),
    });

    setMessageText("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (dateString: string) => {
    return format(new Date(dateString), "HH:mm", { locale: ptBR });
  };

  const getLastMessage = (memberId: string) => {
    // This would need a separate query for last messages
    return "";
  };

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] bg-card rounded-xl border border-border overflow-hidden">
      {/* Members List */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold mb-3">Chat da Equipe</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar atendente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 input-search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Nenhum atendente encontrado
            </div>
          ) : (
            filteredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                className={cn(
                  "flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border",
                  selectedMember?.id === member.id && "bg-muted"
                )}
              >
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {member.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                      member.online ? "bg-green-500" : "bg-muted"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm truncate">{member.name}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">{member.role}</p>
                    {unreadCounts[member.id] > 0 && (
                      <span className="w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground text-xs rounded-full">
                        {unreadCounts[member.id]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedMember ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-16 border-b border-border flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={selectedMember.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {selectedMember.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card",
                    selectedMember.online ? "bg-green-500" : "bg-muted"
                  )}
                />
              </div>
              <div>
                <p className="font-medium">{selectedMember.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedMember.online ? "Online" : "Offline"} • {selectedMember.role}
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30 scrollbar-thin">
            {messagesLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Nenhuma mensagem ainda. Comece a conversa!
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.sender_id === user?.id ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%]",
                      message.sender_id === user?.id ? "chat-bubble-outgoing" : "chat-bubble-incoming"
                    )}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 text-right">
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex items-end gap-2">
              <Button variant="ghost" size="icon" className="shrink-0">
                <Smile className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Paperclip className="w-5 h-5" />
              </Button>
              <Textarea
                placeholder="Digite sua mensagem..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyPress}
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button 
                size="icon" 
                className="shrink-0 bg-primary hover:bg-primary/90"
                onClick={handleSendMessage}
                disabled={sendMessage.isPending || !messageText.trim()}
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
          Selecione um membro da equipe para iniciar uma conversa
        </div>
      )}
    </div>
  );
}
