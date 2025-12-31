-- Create chatbot_flows table to manage multiple flows
CREATE TABLE public.chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  trigger_type TEXT DEFAULT 'keyword',
  trigger_value TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow authenticated users to view
CREATE POLICY "Authenticated users can view flows"
ON public.chatbot_flows FOR SELECT
USING (true);

-- RLS Policy - Allow admins and managers to manage
CREATE POLICY "Admins and managers can manage flows"
ON public.chatbot_flows FOR ALL
USING (is_admin_or_manager(auth.uid()));

-- Add foreign key constraint to flow_nodes
ALTER TABLE public.flow_nodes 
ADD CONSTRAINT flow_nodes_flow_id_fkey 
FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;

-- Add foreign key constraint to flow_edges
ALTER TABLE public.flow_edges 
ADD CONSTRAINT flow_edges_flow_id_fkey 
FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;

-- Create trigger for updated_at
CREATE TRIGGER update_chatbot_flows_updated_at
BEFORE UPDATE ON public.chatbot_flows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();