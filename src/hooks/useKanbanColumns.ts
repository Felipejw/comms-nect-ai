import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KanbanColumn {
  id: string;
  name: string;
  color: string | null;
  position: number | null;
}

export function useKanbanColumns() {
  return useQuery({
    queryKey: ["kanban-columns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_columns")
        .select("*")
        .order("position", { ascending: true });

      if (error) throw error;
      return data as KanbanColumn[];
    },
  });
}
