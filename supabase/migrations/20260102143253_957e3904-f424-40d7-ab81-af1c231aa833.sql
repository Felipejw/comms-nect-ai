-- Create system_settings table
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'options',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins and managers can manage settings
CREATE POLICY "Admins and managers can view settings"
ON public.system_settings FOR SELECT
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can insert settings"
ON public.system_settings FOR INSERT
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update settings"
ON public.system_settings FOR UPDATE
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can delete settings"
ON public.system_settings FOR DELETE
USING (public.is_admin_or_manager(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.system_settings (key, value, description, category) VALUES
  ('send_transfer_message', 'disabled', 'Enviar mensagem ao transferir setor/atendente', 'options'),
  ('allow_operator_signature', 'disabled', 'Permite atendente escolher enviar assinatura', 'options'),
  ('require_tag_to_close', 'disabled', 'Tag obrigatória para fechar ticket', 'options'),
  ('send_greeting_on_accept', 'disabled', 'Enviar saudação ao aceitar conversa', 'options'),
  ('accept_audio_all_conversations', 'enabled', 'Aceita receber áudio de todas conversas', 'options'),
  ('close_on_transfer', 'enabled', 'Fechar conversa ao transferir para outro setor', 'options'),
  ('random_operator_selection', 'disabled', 'Escolher atendente aleatório', 'options'),
  ('reject_whatsapp_calls', 'enabled', 'Informar que não aceita ligação no WhatsApp', 'options');