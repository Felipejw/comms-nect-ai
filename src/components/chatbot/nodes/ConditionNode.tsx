import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

interface ConditionNodeData {
  label?: string;
  field?: string;
  operator?: string;
  value?: string;
  [key: string]: unknown;
}

function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as ConditionNodeData;
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-warning ring-2 ring-warning/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-warning !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-warning">
          <GitBranch className="w-4 h-4 text-warning-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Condição"}</p>
          <p className="text-xs text-muted-foreground">
            {nodeData.field ? `${nodeData.field} ${nodeData.operator} ${nodeData.value}` : "Clique para configurar"}
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
