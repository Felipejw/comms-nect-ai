import { useState } from "react";
import { Plus, Search, Clock, User, Calendar as CalendarIcon, Bell, MoreHorizontal } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Schedule {
  id: string;
  contact: string;
  title: string;
  description: string;
  date: string;
  time: string;
  status: "pending" | "completed" | "cancelled";
  reminder: boolean;
}

const schedules: Schedule[] = [
  { id: "1", contact: "Maria Silva", title: "Follow-up pedido", description: "Verificar satisfação com entrega", date: "29/12/2024", time: "10:00", status: "pending", reminder: true },
  { id: "2", contact: "João Santos", title: "Reunião de feedback", description: "Coletar feedback do cliente", date: "29/12/2024", time: "14:30", status: "pending", reminder: true },
  { id: "3", contact: "Ana Costa", title: "Demonstração produto", description: "Apresentar nova linha", date: "30/12/2024", time: "09:00", status: "pending", reminder: false },
  { id: "4", contact: "Carlos Oliveira", title: "Renovação contrato", description: "Discutir termos de renovação", date: "30/12/2024", time: "11:00", status: "pending", reminder: true },
  { id: "5", contact: "Beatriz Lima", title: "Suporte técnico", description: "Resolver problema relatado", date: "28/12/2024", time: "15:00", status: "completed", reminder: false },
  { id: "6", contact: "Pedro Alves", title: "Onboarding", description: "Primeiro contato pós-venda", date: "27/12/2024", time: "10:30", status: "cancelled", reminder: false },
];

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning" },
  completed: { label: "Concluído", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

export default function Agendamentos() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());

  const filteredSchedules = schedules.filter((s) =>
    s.contact.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todaySchedules = filteredSchedules.filter((s) => s.date === "29/12/2024");
  const upcomingSchedules = filteredSchedules.filter((s) => s.date !== "29/12/2024" && s.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agendamentos</h2>
          <p className="text-muted-foreground">Gerencie lembretes e compromissos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
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
                <Label>Contato</Label>
                <Input placeholder="Nome do contato" />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input placeholder="Título do agendamento" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea placeholder="Detalhes do agendamento" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" />
                </div>
              </div>
              <Button className="w-full" onClick={() => setIsDialogOpen(false)}>
                Criar Agendamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="bg-card rounded-xl border border-border p-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md"
          />
        </div>

        {/* Today's Schedule */}
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
                  <ScheduleItem key={schedule.id} schedule={schedule} />
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
                  <ScheduleItem key={schedule.id} schedule={schedule} />
                ))
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum agendamento próximo</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleItem({ schedule }: { schedule: Schedule }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {schedule.contact.split(" ").map((n) => n[0]).join("")}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-medium text-sm truncate">{schedule.title}</p>
          {schedule.reminder && <Bell className="w-3 h-3 text-warning" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {schedule.contact}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {schedule.time}
          </span>
          <span>{schedule.date}</span>
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
          <DropdownMenuItem>Editar</DropdownMenuItem>
          <DropdownMenuItem>Marcar como concluído</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">Cancelar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
