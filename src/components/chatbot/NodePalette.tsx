import { Zap, MessageSquare, GitBranch, Clock, List, UserPlus, XCircle } from "lucide-react";

const nodeTypes = [
  { type: "trigger", icon: Zap, label: "Gatilho", color: "bg-primary" },
  { type: "message", icon: MessageSquare, label: "Mensagem", color: "bg-success" },
  { type: "condition", icon: GitBranch, label: "Condição", color: "bg-warning" },
  { type: "delay", icon: Clock, label: "Aguardar", color: "bg-info" },
  { type: "menu", icon: List, label: "Menu", color: "bg-orange-500" },
  { type: "transfer", icon: UserPlus, label: "Transferir", color: "bg-destructive" },
  { type: "end", icon: XCircle, label: "Encerrar", color: "bg-pink-500" },
];

interface NodePaletteProps {
  disabled?: boolean;
}

export function NodePalette({ disabled }: NodePaletteProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border border-border">
      <span className="text-sm font-medium text-muted-foreground mr-2">Blocos:</span>
      {nodeTypes.map((node) => (
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
