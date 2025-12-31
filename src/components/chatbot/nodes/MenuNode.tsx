import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { List } from "lucide-react";

interface MenuOption {
  id: string;
  text: string;
}

interface MenuNodeData {
  label?: string;
  title?: string;
  options?: MenuOption[];
  [key: string]: unknown;
}

function MenuNode({ data, selected }: NodeProps) {
  const nodeData = data as MenuNodeData;
  const options = nodeData.options || [];
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-orange-500 ring-2 ring-orange-500/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-500">
          <List className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Menu"}</p>
          <p className="text-xs text-muted-foreground">
            {options.length > 0 ? `${options.length} opções` : "Clique para configurar"}
          </p>
        </div>
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {options.map((option, index) => (
            <div key={option.id} className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground mb-1">{index + 1}</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={option.id}
                className="!relative !transform-none !w-3 !h-3 !bg-orange-500 !border-2 !border-background"
              />
            </div>
          ))}
        </div>
      )}
      {options.length === 0 && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-orange-500 !border-2 !border-background"
        />
      )}
    </div>
  );
}

export default memo(MenuNode);
