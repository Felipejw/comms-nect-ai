import { Zap, MessageSquare, Clock, List, UserPlus, XCircle, Brain, LayoutList, MessageCircle, GitBranch } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const sidebarNodeTypes = [
  { type: "trigger", icon: Zap, label: "Gatilho", color: "bg-primary" },
  { type: "message", icon: MessageSquare, label: "Mensagem", color: "bg-success" },
  { type: "whatsapp", icon: MessageCircle, label: "WhatsApp", color: "bg-green-500" },
  { type: "ai", icon: Brain, label: "IA", color: "bg-violet-500" },
  { type: "delay", icon: Clock, label: "Aguardar", color: "bg-info" },
  { type: "menu", icon: List, label: "Menu", color: "bg-orange-500" },
  { type: "condition", icon: GitBranch, label: "Condição", color: "bg-amber-500" },
  { type: "crm", icon: LayoutList, label: "CRM", color: "bg-sky-500" },
  { type: "transfer", icon: UserPlus, label: "Transferir", color: "bg-destructive" },
  { type: "end", icon: XCircle, label: "Encerrar", color: "bg-pink-500" },
];

const topBarNodeTypes: typeof sidebarNodeTypes = [];

interface NodePaletteProps {
  disabled?: boolean;
}

export function NodePaletteSidebar({ disabled }: NodePaletteProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-48 border-r border-border bg-card flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h3 className="font-semibold text-sm">Blocos</h3>
        <p className="text-xs text-muted-foreground">Arraste para adicionar</p>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {sidebarNodeTypes.map((node) => (
            <div
              key={node.type}
              draggable={!disabled}
              onDragStart={(e) => onDragStart(e, node.type)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background cursor-grab hover:shadow-md transition-all ${
                disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02] active:cursor-grabbing"
              }`}
            >
              <div className={`p-1.5 rounded ${node.color}`}>
                <node.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-medium">{node.label}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function NodePaletteTopBar({ disabled }: NodePaletteProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex items-center gap-2">
      {topBarNodeTypes.map((node) => (
        <div
          key={node.type}
          draggable={!disabled}
          onDragStart={(e) => onDragStart(e, node.type)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card cursor-grab hover:shadow-md transition-all ${
            disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:cursor-grabbing"
          }`}
        >
          <div className={`p-1.5 rounded ${node.color}`}>
            <node.icon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-medium">{node.label}</span>
        </div>
      ))}
    </div>
  );
}

// Legacy export for backwards compatibility
export function NodePalette({ disabled }: NodePaletteProps) {
  return <NodePaletteTopBar disabled={disabled} />;
}
