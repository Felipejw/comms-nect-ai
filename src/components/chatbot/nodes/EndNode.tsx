import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { XCircle, CheckCircle } from "lucide-react";

interface EndNodeData {
  label?: string;
  message?: string;
  markAsResolved?: boolean;
  [key: string]: unknown;
}

function EndNode({ data, selected }: NodeProps) {
  const nodeData = data as EndNodeData;
  const markAsResolved = nodeData.markAsResolved ?? true;
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-pink-500 ring-2 ring-pink-500/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-pink-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-pink-500">
          <XCircle className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Encerrar"}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {markAsResolved ? (
              <>
                <CheckCircle className="w-3 h-3 text-success" />
                Finalizar e resolver
              </>
            ) : (
              "Finalizar conversa"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default memo(EndNode);
