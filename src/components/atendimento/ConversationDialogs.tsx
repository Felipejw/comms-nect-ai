import { Loader2, Bot, Trash2, Tag, FileText, Archive, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
}

interface Flow {
  id: string;
  name: string;
  is_active: boolean;
}

interface Queue {
  id: string;
  name: string;
  color: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-primary/10 text-primary" },
  in_progress: { label: "Em Atendimento", className: "bg-warning/10 text-warning" },
  resolved: { label: "Resolvido", className: "bg-success/10 text-success" },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground" },
};

interface ConversationDialogsProps {
  // Delete dialog
  showDeleteDialog: boolean;
  setShowDeleteDialog: (v: boolean) => void;
  onDeleteConversation: () => Promise<void>;
  deleteLoading: boolean;

  // Schedule dialog
  showScheduleDialog: boolean;
  setShowScheduleDialog: (v: boolean) => void;
  scheduleTitle: string;
  setScheduleTitle: (v: string) => void;
  scheduleDescription: string;
  setScheduleDescription: (v: string) => void;
  scheduleDate: string;
  setScheduleDate: (v: string) => void;
  scheduleTime: string;
  setScheduleTime: (v: string) => void;
  onCreateSchedule: () => void;
  scheduleLoading: boolean;

  // Bot flow dialog
  showBotFlowDialog: boolean;
  setShowBotFlowDialog: (v: boolean) => void;
  selectedFlowId: string;
  setSelectedFlowId: (v: string) => void;
  activeFlows: Flow[];
  onConfirmTransferToBot: () => Promise<void>;
  transferLoading: boolean;

  // Queue dialog
  showQueueDialog: boolean;
  setShowQueueDialog: (v: boolean) => void;
  selectedQueueId: string;
  setSelectedQueueId: (v: string) => void;
  queues: Queue[];
  onConfirmChangeQueue: () => Promise<void>;
  queueLoading: boolean;
}

export function ConversationDialogs(props: ConversationDialogsProps) {
  return (
    <>
      {/* Delete Conversation Dialog */}
      <AlertDialog open={props.showDeleteDialog} onOpenChange={props.setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conversa? Todas as mensagens serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={props.onDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {props.deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule Dialog */}
      <Dialog open={props.showScheduleDialog} onOpenChange={props.setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Mensagem/Lembrete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={props.scheduleTitle} onChange={(e) => props.setScheduleTitle(e.target.value)} placeholder="Ex: Retornar ligação" />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={props.scheduleDescription} onChange={(e) => props.setScheduleDescription(e.target.value)} placeholder="Detalhes do agendamento..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={props.scheduleDate} onChange={(e) => props.setScheduleDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={props.scheduleTime} onChange={(e) => props.setScheduleTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowScheduleDialog(false)}>Cancelar</Button>
            <Button onClick={props.onCreateSchedule} disabled={props.scheduleLoading || !props.scheduleTitle.trim() || !props.scheduleDate || !props.scheduleTime}>
              {props.scheduleLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer to Bot Flow Dialog */}
      <Dialog open={props.showBotFlowDialog} onOpenChange={props.setShowBotFlowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Fluxo do Chatbot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Selecione o fluxo de chatbot para onde a conversa será transferida:</p>
            <Select value={props.selectedFlowId} onValueChange={props.setSelectedFlowId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um fluxo" />
              </SelectTrigger>
              <SelectContent>
                {props.activeFlows.map(flow => (
                  <SelectItem key={flow.id} value={flow.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" />
                      {flow.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowBotFlowDialog(false)}>Cancelar</Button>
            <Button onClick={props.onConfirmTransferToBot} disabled={props.transferLoading || !props.selectedFlowId}>
              {props.transferLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Queue Dialog */}
      <Dialog open={props.showQueueDialog} onOpenChange={props.setShowQueueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar Setor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Selecione o setor para onde a conversa será movida:</p>
            <Select value={props.selectedQueueId} onValueChange={props.setSelectedQueueId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem setor</SelectItem>
                {props.queues?.map(queue => (
                  <SelectItem key={queue.id} value={queue.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: queue.color }} />
                      {queue.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowQueueDialog(false)}>Cancelar</Button>
            <Button onClick={props.onConfirmChangeQueue} disabled={props.queueLoading}>
              {props.queueLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface BulkDialogsProps {
  // Bulk Delete
  showBulkDeleteDialog: boolean;
  setShowBulkDeleteDialog: (v: boolean) => void;
  selectedCount: number;
  onBulkDelete: () => Promise<void>;
  bulkDeleteLoading: boolean;

  // Bulk Status
  showBulkStatusDialog: boolean;
  setShowBulkStatusDialog: (v: boolean) => void;
  bulkStatusValue: string;
  setBulkStatusValue: (v: string) => void;
  onBulkStatusUpdate: () => Promise<void>;
  bulkStatusLoading: boolean;

  // Bulk Assign
  showBulkAssignDialog: boolean;
  setShowBulkAssignDialog: (v: boolean) => void;
  bulkAssignValue: string;
  setBulkAssignValue: (v: string) => void;
  onBulkAssign: () => Promise<void>;
  bulkAssignLoading: boolean;
  users: UserProfile[];

  // Bulk Tag
  showBulkTagDialog: boolean;
  setShowBulkTagDialog: (v: boolean) => void;
  bulkTagMode: 'add' | 'remove';
  setBulkTagMode: (v: 'add' | 'remove') => void;
  selectedBulkTags: Set<string>;
  setSelectedBulkTags: (v: Set<string>) => void;
  onBulkTagAction: () => Promise<void>;
  bulkTagLoading: boolean;
  tags: Tag[];

  // Export
  showExportDialog: boolean;
  setShowExportDialog: (v: boolean) => void;
  exportFormat: 'csv' | 'pdf';
  setExportFormat: (v: 'csv' | 'pdf') => void;
  onExport: () => Promise<void>;
  exportLoading: boolean;
}

export function BulkDialogs(props: BulkDialogsProps) {
  return (
    <>
      {/* Bulk Delete Dialog */}
      <AlertDialog open={props.showBulkDeleteDialog} onOpenChange={props.setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversas em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {props.selectedCount} conversa(s)?
              Esta ação não pode ser desfeita e todas as mensagens serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={props.onBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {props.bulkDeleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir {props.selectedCount} conversa(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Dialog */}
      <Dialog open={props.showBulkStatusDialog} onOpenChange={props.setShowBulkStatusDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alterar Status em Massa</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Alterar o status de {props.selectedCount} conversa(s) para:</p>
            <Select value={props.bulkStatusValue} onValueChange={props.setBulkStatusValue}>
              <SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <Badge className={cn("text-xs", config.className)}>{config.label}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowBulkStatusDialog(false)}>Cancelar</Button>
            <Button onClick={props.onBulkStatusUpdate} disabled={props.bulkStatusLoading || !props.bulkStatusValue}>
              {props.bulkStatusLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={props.showBulkAssignDialog} onOpenChange={props.setShowBulkAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Atribuir Agente em Massa</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Atribuir {props.selectedCount} conversa(s) para:</p>
            <Select value={props.bulkAssignValue} onValueChange={props.setBulkAssignValue}>
              <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none"><span className="text-muted-foreground">Sem atribuição</span></SelectItem>
                {props.users?.map(u => (
                  <SelectItem key={u.id} value={u.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-5 h-5">
                        <AvatarImage src={u.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">{u.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {u.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowBulkAssignDialog(false)}>Cancelar</Button>
            <Button onClick={props.onBulkAssign} disabled={props.bulkAssignLoading}>
              {props.bulkAssignLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={props.showBulkTagDialog} onOpenChange={props.setShowBulkTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{props.bulkTagMode === 'add' ? 'Adicionar Tags em Massa' : 'Remover Tags em Massa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button variant={props.bulkTagMode === 'add' ? 'default' : 'outline'} size="sm" onClick={() => props.setBulkTagMode('add')}>Adicionar Tags</Button>
              <Button variant={props.bulkTagMode === 'remove' ? 'default' : 'outline'} size="sm" onClick={() => props.setBulkTagMode('remove')}>Remover Tags</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {props.bulkTagMode === 'add'
                ? `Selecione as tags para adicionar a ${props.selectedCount} conversa(s):`
                : `Selecione as tags para remover de ${props.selectedCount} conversa(s):`}
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {props.tags?.map(tag => (
                <div key={tag.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                  <Checkbox
                    checked={props.selectedBulkTags.has(tag.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(props.selectedBulkTags);
                      if (checked) newSet.add(tag.id); else newSet.delete(tag.id);
                      props.setSelectedBulkTags(newSet);
                    }}
                  />
                  <Badge style={{ backgroundColor: tag.color }} className="text-white">{tag.name}</Badge>
                  {tag.description && <span className="text-xs text-muted-foreground">{tag.description}</span>}
                </div>
              ))}
              {(!props.tags || props.tags.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tag disponível</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowBulkTagDialog(false)}>Cancelar</Button>
            <Button onClick={props.onBulkTagAction} disabled={props.selectedBulkTags.size === 0 || props.bulkTagLoading}>
              {props.bulkTagLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {props.bulkTagMode === 'add' ? 'Adicionar' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={props.showExportDialog} onOpenChange={props.setShowExportDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Exportar Conversas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Exportar {props.selectedCount} conversa(s) com todas as mensagens</p>
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={props.exportFormat} onValueChange={(v) => props.setExportFormat(v as 'csv' | 'pdf')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2"><FileText className="w-4 h-4" />CSV (Excel)</div>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2"><FileText className="w-4 h-4" />HTML (Relatório para PDF)</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowExportDialog(false)}>Cancelar</Button>
            <Button onClick={props.onExport} disabled={props.exportLoading}>
              {props.exportLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
