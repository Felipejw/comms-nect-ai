import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch, Tag, Columns, MessageSquare, Clock, Calendar, Hash } from "lucide-react";

interface ConditionNodeData {
  label?: string;
  conditionType?: string;
  field?: string;
  operator?: string;
  value?: string;
  tagId?: string;
  tagName?: string;
  kanbanColumnId?: string;
  kanbanColumnName?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: string[];
  messageCount?: number;
  messageOperator?: string;
  [key: string]: unknown;
}

const CONDITION_ICONS: Record<string, React.ReactNode> = {
  tag: <Tag className="w-4 h-4 text-warning-foreground" />,
  kanban: <Columns className="w-4 h-4 text-warning-foreground" />,
  message: <MessageSquare className="w-4 h-4 text-warning-foreground" />,
  business_hours: <Clock className="w-4 h-4 text-warning-foreground" />,
  day_of_week: <Calendar className="w-4 h-4 text-warning-foreground" />,
  message_count: <Hash className="w-4 h-4 text-warning-foreground" />,
  default: <GitBranch className="w-4 h-4 text-warning-foreground" />,
};

const DAY_NAMES: Record<string, string> = {
  "0": "Dom",
  "1": "Seg",
  "2": "Ter",
  "3": "Qua",
  "4": "Qui",
  "5": "Sex",
  "6": "Sáb",
};

function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as ConditionNodeData;
  const conditionType = nodeData.conditionType || "message";
  
  const getConditionDescription = () => {
    switch (conditionType) {
      case "tag":
        return nodeData.tagName ? `Tem tag "${nodeData.tagName}"` : "Verificar tag";
      case "kanban":
        return nodeData.kanbanColumnName ? `Etapa CRM "${nodeData.kanbanColumnName}"` : "Verificar etapa CRM";
      case "business_hours":
        if (nodeData.startTime && nodeData.endTime) {
          return `${nodeData.startTime} - ${nodeData.endTime}`;
        }
        return "Horário de atendimento";
      case "day_of_week":
        if (nodeData.daysOfWeek && nodeData.daysOfWeek.length > 0) {
          return nodeData.daysOfWeek.map(d => DAY_NAMES[d] || d).join(", ");
        }
        return "Dias da semana";
      case "message_count":
        if (nodeData.messageCount !== undefined && nodeData.messageOperator) {
          const opLabels: Record<string, string> = {
            greater: ">",
            less: "<",
            equals: "=",
            greater_equals: "≥",
            less_equals: "≤",
          };
          return `Msgs ${opLabels[nodeData.messageOperator] || ">"} ${nodeData.messageCount}`;
        }
        return "Quantidade de mensagens";
      case "message":
        if (nodeData.field && nodeData.operator && nodeData.value) {
          const opLabels: Record<string, string> = {
            contains: "contém",
            equals: "=",
            not_equals: "≠",
            starts_with: "começa com",
            ends_with: "termina com",
          };
          return `${nodeData.field} ${opLabels[nodeData.operator] || nodeData.operator} "${nodeData.value}"`;
        }
        return "Verificar mensagem";
      default:
        return "Clique para configurar";
    }
  };
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-warning ring-2 ring-warning/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-3 !h-3 !bg-warning !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-warning">
          {CONDITION_ICONS[conditionType] || CONDITION_ICONS.default}
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Condição"}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {getConditionDescription()}
          </p>
        </div>
      </div>
      <div className="flex justify-between mt-3 px-2">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-success font-medium mb-1">Sim</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            className="!relative !transform-none !w-3 !h-3 !bg-success !border-2 !border-background"
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-destructive font-medium mb-1">Não</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            className="!relative !transform-none !w-3 !h-3 !bg-destructive !border-2 !border-background"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(ConditionNode);
