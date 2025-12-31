import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { UserPlus } from "lucide-react";

interface TransferNodeData {
  label?: string;
  queueId?: string;
  queueName?: string;
  message?: string;
  [key: string]: unknown;
}

function TransferNode({ data, selected }: NodeProps) {
  const nodeData = data as TransferNodeData;
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-destructive ring-2 ring-destructive/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-destructive !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive">
          <UserPlus className="w-4 h-4 text-destructive-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Transferir"}</p>
          <p className="text-xs text-muted-foreground">
            {nodeData.queueName || "Clique para configurar"}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-destructive !border-2 !border-background"
      />
    </div>
  );
}

export default memo(TransferNode);
