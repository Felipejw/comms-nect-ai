import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface ChatbotFlow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface FlowNode {
  id: string;
  flow_id: string;
  type: string;
  position_x: number | null;
  position_y: number | null;
  data: Json;
  created_at: string;
}

export interface FlowEdge {
  id: string;
  flow_id: string;
  source_id: string;
  target_id: string;
  label: string | null;
  created_at: string;
}

export function useFlows() {
  return useQuery({
    queryKey: ["chatbot-flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_flows" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ChatbotFlow[];
    },
  });
}

export function useFlow(id: string | null) {
  return useQuery({
    queryKey: ["chatbot-flow", id],
    queryFn: async () => {
      if (!id) return null;

      const { data: flow, error: flowError } = await supabase
        .from("chatbot_flows" as any)
        .select("*")
        .eq("id", id)
        .single();

      if (flowError) throw flowError;

      const { data: nodes, error: nodesError } = await supabase
        .from("flow_nodes")
        .select("*")
        .eq("flow_id", id);

      if (nodesError) throw nodesError;

      const { data: edges, error: edgesError } = await supabase
        .from("flow_edges")
        .select("*")
        .eq("flow_id", id);

      if (edgesError) throw edgesError;

      return {
        flow: flow as unknown as ChatbotFlow,
        nodes: nodes as FlowNode[],
        edges: edges as FlowEdge[],
      };
    },
    enabled: !!id,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: flow, error } = await supabase
        .from("chatbot_flows" as any)
        .insert({
          name: data.name,
          description: data.description || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return flow as unknown as ChatbotFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      toast.success("Fluxo criado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao criar fluxo");
    },
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const { error } = await supabase
        .from("chatbot_flows" as any)
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      toast.success("Fluxo atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar fluxo");
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete edges first
      await supabase.from("flow_edges").delete().eq("flow_id", id);
      // Delete nodes
      await supabase.from("flow_nodes").delete().eq("flow_id", id);
      // Delete flow
      const { error } = await supabase
        .from("chatbot_flows" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      toast.success("Fluxo excluído!");
    },
    onError: () => {
      toast.error("Erro ao excluir fluxo");
    },
  });
}

export function useSaveFlowData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      flowId,
      nodes,
      edges,
    }: {
      flowId: string;
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label?: string;
      }>;
    }) => {
      // Delete existing nodes and edges
      await supabase.from("flow_edges").delete().eq("flow_id", flowId);
      await supabase.from("flow_nodes").delete().eq("flow_id", flowId);

      // Insert new nodes
      if (nodes.length > 0) {
        const { error: nodesError } = await supabase.from("flow_nodes").insert(
          nodes.map((node) => ({
            id: node.id,
            flow_id: flowId,
            type: node.type,
            position_x: node.position.x,
            position_y: node.position.y,
            data: node.data as Json,
          }))
        );
        if (nodesError) throw nodesError;
      }

      // Insert new edges
      if (edges.length > 0) {
        const { error: edgesError } = await supabase.from("flow_edges").insert(
          edges.map((edge) => ({
            // Generate a proper UUID if the edge id is not a valid UUID (React Flow uses format like "xy-edge__...")
            id: edge.id.startsWith("xy-edge__") ? crypto.randomUUID() : edge.id,
            flow_id: flowId,
            source_id: edge.source,
            target_id: edge.target,
            label: edge.label || null,
          }))
        );
        if (edgesError) throw edgesError;
      }

      // Update flow timestamp
      await supabase
        .from("chatbot_flows" as any)
        .update({ updated_at: new Date().toISOString() })
        .eq("id", flowId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["chatbot-flow", variables.flowId],
      });
    },
  });
}
