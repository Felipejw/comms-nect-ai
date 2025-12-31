-- Criar tabela de relacionamento conversation_tags
CREATE TABLE public.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view conversation tags"
ON public.conversation_tags FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage conversation tags"
ON public.conversation_tags FOR ALL
USING (true);

-- Enable realtime for conversation_tags
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tags;