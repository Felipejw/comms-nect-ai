import { useState } from "react";
import { Search, Send, Smile, Paperclip, Phone, Video, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  online: boolean;
  lastMessage: string;
  time: string;
  unread?: number;
}

interface Message {
  id: string;
  content: string;
  sender: "me" | "them";
  time: string;
}

const teamMembers: TeamMember[] = [
  { id: "1", name: "Carlos Eduardo", role: "Operador", online: true, lastMessage: "Ok, vou verificar agora", time: "10:30", unread: 2 },
  { id: "2", name: "Fernanda Souza", role: "Operador", online: true, lastMessage: "Pronto, transferi para você", time: "09:45" },
  { id: "3", name: "Ricardo Lima", role: "Gestor", online: false, lastMessage: "Reunião às 15h", time: "Ontem" },
  { id: "4", name: "Patricia Mendes", role: "Operador", online: true, lastMessage: "Vou almoçar, volto logo", time: "12:00" },
  { id: "5", name: "Lucas Santos", role: "Gestor", online: true, lastMessage: "Relatório enviado", time: "11:20" },
];

const messages: Message[] = [
  { id: "1", content: "Oi Carlos! Preciso de uma ajuda", time: "10:25", sender: "me" },
  { id: "2", content: "Claro, pode falar!", time: "10:26", sender: "them" },
  { id: "3", content: "Tem um cliente aqui com dúvida sobre o plano empresarial, você pode me ajudar?", time: "10:28", sender: "me" },
  { id: "4", content: "Sim! Qual é a dúvida específica?", time: "10:29", sender: "them" },
  { id: "5", content: "Ele quer saber sobre os limites de usuários no plano", time: "10:29", sender: "me" },
  { id: "6", content: "Ok, vou verificar agora", time: "10:30", sender: "them" },
];

export default function ChatInterno() {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(teamMembers[0]);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMembers = teamMembers.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] bg-card rounded-xl border border-border overflow-hidden">
      {/* Members List */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold mb-3">Chat da Equipe</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar membro..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 input-search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredMembers.map((member) => (
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
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {member.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                    member.online ? "bg-status-online" : "bg-status-offline"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm truncate">{member.name}</p>
                  <span className="text-xs text-muted-foreground">{member.time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground truncate">{member.lastMessage}</p>
                  {member.unread && (
                    <span className="w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground text-xs rounded-full">
                      {member.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {selectedMember.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card",
                    selectedMember.online ? "bg-status-online" : "bg-status-offline"
                  )}
                />
              </div>
              <div>
                <p className="font-medium">{selectedMember.name}</p>
                <p className="text-xs text-muted-foreground">{selectedMember.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Phone className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30 scrollbar-thin">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.sender === "me" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[70%]",
                    message.sender === "me" ? "chat-bubble-outgoing" : "chat-bubble-incoming"
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">{message.time}</p>
                </div>
              </div>
            ))}
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
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button size="icon" className="shrink-0 bg-accent hover:bg-accent/90">
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Selecione um membro da equipe
        </div>
      )}
    </div>
  );
}
