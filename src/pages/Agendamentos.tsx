import { useState } from "react";
import { Plus, Search, Clock, User, Calendar as CalendarIcon, Bell, MoreHorizontal, Loader2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from "@/hooks/useSchedules";
import { useContacts } from "@/hooks/useContacts";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { format, isSameDay, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ReadOnlyBadge } from "@/components/ui/ReadOnlyBadge";

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning" },
  completed: { label: "Concluído", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

export default function Agendamentos() {
  const { user, hasPermission, isAdmin } = useAuth();
  const canEdit = isAdmin || hasPermission('agendamentos', 'edit');
  
  const { data: schedules = [], isLoading } = useSchedules();
  const { data: contacts = [] } = useContacts();
  const { data: conversations = [] } = useConversations();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [contactId, setContactId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [reminder, setReminder] = useState(true);

  const filteredSchedules = schedules.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const today = startOfDay(new Date());
  
  const todaySchedules = filteredSchedules.filter((s) => 
    isSameDay(new Date(s.scheduled_at), today) && s.status === "pending"
  );
  
  const upcomingSchedules = filteredSchedules.filter((s) => 
    isAfter(startOfDay(new Date(s.scheduled_at)), today) && s.status === "pending"
  );

  const pastSchedules = filteredSchedules.filter((s) => 
    s.status !== "pending"
  );

  const handleCreate = async () => {
    if (!title.trim() || !scheduledDate || !scheduledTime || !user?.id) return;

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);

    await createSchedule.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      message_content: messageContent.trim() || undefined,
      contact_id: contactId && contactId !== 'none' ? contactId : undefined,
      conversation_id: conversationId && conversationId !== 'none' ? conversationId : undefined,
      user_id: user.id,
      scheduled_at: scheduledAt.toISOString(),
      reminder,
    });

    resetForm();
    setIsDialogOpen(false);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setMessageContent("");
    setContactId("");
    setConversationId("");
    setScheduledDate("");
    setScheduledTime("");
    setReminder(true);
  };

  const handleMarkCompleted = async (id: string) => {
    await updateSchedule.mutateAsync({ id, status: "completed" });
  };

  const handleCancel = async (id: string) => {
    await updateSchedule.mutateAsync({ id, status: "cancelled" });
  };

  const handleDelete = async (id: string) => {
    await deleteSchedule.mutateAsync(id);
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
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold">Agendamentos</h2>
            <p className="text-muted-foreground">Gerencie lembretes e compromissos</p>
          </div>
          {!canEdit && <ReadOnlyBadge />}
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={!canEdit}>
              <Plus className="w-4 h-4" />
              Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Agendamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Contato (opcional)</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum contato</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name} {contact.phone ? `(${contact.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conversa (opcional)</Label>
                <Select value={conversationId} onValueChange={setConversationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma conversa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma conversa</SelectItem>
                    {conversations.filter(c => c.status !== 'archived').map((conv) => (
                      <SelectItem key={conv.id} value={conv.id}>
                        {conv.contact?.name || 'Sem nome'} - {conv.status === 'in_progress' ? 'Em atendimento' : conv.status === 'new' ? 'Nova' : 'Resolvida'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input 
                  placeholder="Título do agendamento" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea 
                  placeholder="Detalhes do agendamento" 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {conversationId && conversationId !== 'none' && (
                <div className="space-y-2">
                  <Label>Mensagem a enviar (opcional)</Label>
                  <Textarea 
                    placeholder="Mensagem que será enviada automaticamente no horário agendado" 
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se preenchida, esta mensagem será enviada automaticamente via WhatsApp no horário agendado.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input 
                    type="date" 
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horário *</Label>
                  <Input 
                    type="time" 
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Ativar lembrete</span>
                </div>
                <Switch checked={reminder} onCheckedChange={setReminder} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={createSchedule.isPending || !title.trim() || !scheduledDate || !scheduledTime}
              >
                {createSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Agendamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="bg-card rounded-xl border border-border p-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-md"
            locale={ptBR}
          />
        </div>

        {/* Schedules */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar agendamentos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Today */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              Hoje
            </h3>
            <div className="space-y-3">
              {todaySchedules.length > 0 ? (
                todaySchedules.map((schedule) => (
                  <ScheduleItem 
                    key={schedule.id} 
                    schedule={schedule} 
                    onComplete={handleMarkCompleted}
                    onCancel={handleCancel}
                    onDelete={handleDelete}
                    canEdit={canEdit}
                  />
                ))
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum agendamento para hoje</p>
              )}
            </div>
          </div>

          {/* Upcoming */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Próximos
            </h3>
            <div className="space-y-3">
              {upcomingSchedules.length > 0 ? (
                upcomingSchedules.map((schedule) => (
                  <ScheduleItem 
                    key={schedule.id} 
                    schedule={schedule}
                    onComplete={handleMarkCompleted}
                    onCancel={handleCancel}
                    onDelete={handleDelete}
                    canEdit={canEdit}
                  />
                ))
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum agendamento próximo</p>
              )}
            </div>
          </div>

          {/* Past/Completed */}
          {pastSchedules.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                Finalizados
              </h3>
              <div className="space-y-3">
                {pastSchedules.slice(0, 5).map((schedule) => (
                  <ScheduleItem 
                    key={schedule.id} 
                    schedule={schedule}
                    onComplete={handleMarkCompleted}
                    onCancel={handleCancel}
                    onDelete={handleDelete}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ScheduleItemProps {
  schedule: {
    id: string;
    title: string;
    description: string | null;
    scheduled_at: string;
    status: "pending" | "completed" | "cancelled";
    reminder: boolean;
    contact?: { name: string } | null;
  };
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

function ScheduleItem({ schedule, onComplete, onCancel, onDelete, canEdit }: ScheduleItemProps) {
  const date = new Date(schedule.scheduled_at);
  const time = format(date, "HH:mm", { locale: ptBR });
  const dateStr = format(date, "dd/MM/yyyy", { locale: ptBR });

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <Avatar className="w-10 h-10">
      <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {schedule.contact?.name?.split(" ").map((n) => n[0]).join("") || schedule.title.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-medium text-sm truncate">{schedule.title}</p>
          {schedule.reminder && schedule.status === "pending" && <Bell className="w-3 h-3 text-warning" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {schedule.contact?.name && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {schedule.contact.name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {time}
          </span>
          <span>{dateStr}</span>
        </div>
      </div>
      <Badge className={statusConfig[schedule.status].className}>
        {statusConfig[schedule.status].label}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {schedule.status === "pending" && canEdit && (
            <>
              <DropdownMenuItem onClick={() => onComplete(schedule.id)}>
                <Check className="w-4 h-4 mr-2" />
                Marcar como concluído
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCancel(schedule.id)}>
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={() => onDelete(schedule.id)} className="text-destructive" disabled={!canEdit}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}