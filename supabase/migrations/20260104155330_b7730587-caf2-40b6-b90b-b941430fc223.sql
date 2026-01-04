-- Habilitar realtime para tabela messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Habilitar REPLICA IDENTITY FULL para capturar dados completos nas mudanças
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Também adicionar conversations para atualização em tempo real da lista
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;