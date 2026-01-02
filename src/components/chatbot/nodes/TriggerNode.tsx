import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

interface TriggerNodeData {
  label?: string;
  triggerType?: string;
  triggerValue?: string;
  [key: string]: unknown;
}

function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as TriggerNodeData;
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Gatilho"}</p>
          <p className="text-xs text-muted-foreground">
            {nodeData.triggerType === "keyword"
              ? `Palavra: ${nodeData.triggerValue || "..."}`
              : nodeData.triggerType === "phrase"
              ? `Frase: ${nodeData.triggerValue || "..."}`
              : nodeData.triggerType === "new_conversation"
              ? "Nova conversa"
              : "Clique para configurar"}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  );
}

export default memo(TriggerNode);
