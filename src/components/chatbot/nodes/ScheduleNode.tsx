import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Calendar } from "lucide-react";

interface ScheduleNodeData {
  label?: string;
  actionType?: "check_availability" | "create_event";
  serviceDuration?: number;
  period?: string;
  eventTitle?: string;
  [key: string]: unknown;
}

function ScheduleNode({ data, selected }: NodeProps) {
  const nodeData = data as ScheduleNodeData;
  
  const getActionDisplay = () => {
    switch (nodeData.actionType) {
      case "check_availability":
        return "Verificar disponibilidade";
      case "create_event":
        return "Criar agendamento";
      default:
        return "Configurar ação";
    }
  };
  
  return (
    <div
      className={`relative px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500">
          <Calendar className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Agendar"}</p>
          <p className="text-xs text-muted-foreground">
            {getActionDisplay()}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />
    </div>
  );
}

export default memo(ScheduleNode);
