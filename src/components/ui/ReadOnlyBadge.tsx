import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ReadOnlyBadge() {
  return (
    <Badge 
      variant="outline" 
      className="gap-1 bg-warning/10 text-warning border-warning/30"
    >
      <Eye className="w-3 h-3" />
      Somente Leitura
    </Badge>
  );
}
