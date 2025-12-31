import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";

interface AINodeData {
  label?: string;
  model?: string;
  isEnabled?: boolean;
  [key: string]: unknown;
}

function AINode({ data, selected }: NodeProps) {
  const nodeData = data as AINodeData;
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-violet-500 ring-2 ring-violet-500/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "IA"}</p>
          <p className="text-xs text-muted-foreground">
            {nodeData.isEnabled 
              ? nodeData.model || "Gemini 2.5 Flash"
              : "Clique para configurar"}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background"
      />
    </div>
  );
}

export default memo(AINode);
