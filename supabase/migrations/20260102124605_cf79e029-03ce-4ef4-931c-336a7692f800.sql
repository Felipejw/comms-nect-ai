-- Adicionar coluna active_flow_id na tabela conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS active_flow_id UUID REFERENCES public.chatbot_flows(id) ON DELETE SET NULL;

-- Adicionar coluna conversation_id na tabela schedules
ALTER TABLE public.schedules 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

-- Deletar colunas padrão do Kanban (criadas pelo sistema)
DELETE FROM public.kanban_columns WHERE name IN ('Novo Lead', 'Em Contato', 'Proposta Enviada', 'Fechado');

-- Atualizar RLS para permitir todos usuários autenticados gerenciarem colunas do Kanban
DROP POLICY IF EXISTS "Admins and managers can manage kanban columns" ON public.kanban_columns;

CREATE POLICY "Authenticated users can manage kanban columns" 
ON public.kanban_columns 
FOR ALL 
USING (true)
WITH CHECK (true);