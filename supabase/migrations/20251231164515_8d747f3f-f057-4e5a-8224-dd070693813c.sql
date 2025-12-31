-- Create kanban_columns table
CREATE TABLE public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#3B82F6',
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

-- RLS policies for kanban_columns
CREATE POLICY "Authenticated users can view kanban columns"
ON public.kanban_columns FOR SELECT
USING (true);

CREATE POLICY "Admins and managers can manage kanban columns"
ON public.kanban_columns FOR ALL
USING (is_admin_or_manager(auth.uid()));

-- Add kanban_column_id to conversations
ALTER TABLE public.conversations 
ADD COLUMN kanban_column_id uuid REFERENCES public.kanban_columns(id);

-- Insert default columns
INSERT INTO public.kanban_columns (name, color, position) VALUES
  ('Novo', '#3B82F6', 0),
  ('Em Atendimento', '#EAB308', 1),
  ('Aguardando', '#8B5CF6', 2),
  ('Concluído', '#22C55E', 3);

-- Create trigger for updated_at
CREATE TRIGGER update_kanban_columns_updated_at
BEFORE UPDATE ON public.kanban_columns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();