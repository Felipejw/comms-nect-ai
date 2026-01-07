-- Adicionar colunas de retry na tabela campaign_contacts
ALTER TABLE campaign_contacts 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Adicionar novas colunas na tabela campaigns para funcionalidades avançadas
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS message_variations text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS use_variations boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS use_buttons boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS buttons jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS min_interval integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS max_interval integer DEFAULT 60;

-- Criar tabela de templates de mensagem
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message text NOT NULL,
  media_url text,
  media_type text DEFAULT 'none',
  created_by uuid REFERENCES profiles(user_id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para message_templates
CREATE POLICY "Authenticated users can view all templates"
ON public.message_templates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create templates"
ON public.message_templates FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own templates"
ON public.message_templates FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own templates"
ON public.message_templates FOR DELETE
TO authenticated
USING (auth.uid() = created_by);

-- Adicionar FK de template na campaigns
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES message_templates(id);

-- Trigger para updated_at
CREATE TRIGGER update_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();