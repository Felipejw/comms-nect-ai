import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";

interface MessageNodeData {
  label?: string;
  content?: string;
  [key: string]: unknown;
}

function MessageNode({ data, selected }: NodeProps) {
  const nodeData = data as MessageNodeData;
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-success ring-2 ring-success/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-success !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-success">
          <MessageSquare className="w-4 h-4 text-success-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{nodeData.label || "Mensagem"}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {nodeData.content || "Clique para editar"}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-success !border-2 !border-background"
      />
    </div>
  );
}

export default memo(MessageNode);
