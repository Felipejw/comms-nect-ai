import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";

interface DelayNodeData {
  label?: string;
  delay?: number;
  unit?: string;
  [key: string]: unknown;
}

function DelayNode({ data, selected }: NodeProps) {
  const nodeData = data as DelayNodeData;
  const unitLabel = nodeData.unit === "minutes" ? "min" : nodeData.unit === "hours" ? "h" : "s";
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-info ring-2 ring-info/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-info !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-info">
          <Clock className="w-4 h-4 text-info-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Aguardar"}</p>
          <p className="text-xs text-muted-foreground">
            {nodeData.delay ? `${nodeData.delay}${unitLabel}` : "Clique para configurar"}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-info !border-2 !border-background"
      />
    </div>
  );
}

export default memo(DelayNode);
