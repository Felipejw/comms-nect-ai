-- Fase 1: Correção de Contatos e LID (após limpeza de duplicatas)

-- 1.1 Adicionar índice único para telefone (apenas quando não nulo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_unique 
ON public.contacts (phone) 
WHERE phone IS NOT NULL AND phone != '';

-- 1.2 Criar função para limpar e normalizar telefones
CREATE OR REPLACE FUNCTION public.normalize_phone(phone_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  clean_phone TEXT;
BEGIN
  IF phone_input IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Remove todos os caracteres não numéricos
  clean_phone := regexp_replace(phone_input, '\D', '', 'g');
  
  -- Se for muito longo (LID típico tem 20+ dígitos), retorna NULL
  IF length(clean_phone) > 15 THEN
    RETURN NULL;
  END IF;
  
  -- Se for muito curto, retorna NULL
  IF length(clean_phone) < 8 THEN
    RETURN NULL;
  END IF;
  
  RETURN clean_phone;
END;
$$;

-- 1.3 Criar função melhorada para prevenir duplicatas
CREATE OR REPLACE FUNCTION public.prevent_duplicate_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_contact_id UUID;
  clean_phone TEXT;
  clean_lid TEXT;
BEGIN
  -- Normalizar telefone
  clean_phone := public.normalize_phone(NEW.phone);
  
  -- Se o phone é na verdade um LID, mover para whatsapp_lid
  IF NEW.phone IS NOT NULL AND clean_phone IS NULL THEN
    clean_lid := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(clean_lid) >= 20 THEN
      NEW.whatsapp_lid := COALESCE(NEW.whatsapp_lid, clean_lid);
      NEW.phone := NULL;
    END IF;
  ELSE
    NEW.phone := clean_phone;
  END IF;
  
  -- Se não tem telefone válido, permitir insert
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;
  
  -- Verificar se já existe contato com este telefone
  SELECT id INTO existing_contact_id
  FROM public.contacts
  WHERE phone = NEW.phone 
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  
  IF existing_contact_id IS NOT NULL THEN
    -- Atualizar contato existente com LID se não tiver
    IF NEW.whatsapp_lid IS NOT NULL THEN
      UPDATE public.contacts 
      SET whatsapp_lid = COALESCE(whatsapp_lid, NEW.whatsapp_lid),
          name = CASE 
            WHEN name IN ('Chatbot Whats', 'Contato Desconhecido') OR name ~ '^\d{14,}$' 
            THEN COALESCE(NULLIF(NEW.name, name), name)
            ELSE name
          END,
          updated_at = now()
      WHERE id = existing_contact_id;
    END IF;
    
    -- Cancelar este insert (prevenção de duplicata)
    RETURN NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 1.4 Recriar trigger
DROP TRIGGER IF EXISTS prevent_duplicate_contacts_trigger ON public.contacts;
CREATE TRIGGER prevent_duplicate_contacts_trigger
  BEFORE INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_contacts();

-- Fase 3: Inicializar ai_settings se vazio
INSERT INTO public.ai_settings (id, name, is_enabled, model, temperature, system_prompt, knowledge_base)
SELECT 
  gen_random_uuid(),
  'default',
  false,
  'google/gemini-2.5-flash',
  0.5,
  'Você é um assistente virtual amigável e profissional. Responda de forma clara e objetiva.',
  ''
WHERE NOT EXISTS (SELECT 1 FROM public.ai_settings LIMIT 1);