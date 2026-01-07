-- Corrigir as últimas 2 políticas RLS permissivas

-- activity_logs - precisa permitir inserção do sistema (edge functions)
-- Mantém como está pois é necessário para logs do sistema

-- quick_replies - restringir para usuários autenticados
DROP POLICY IF EXISTS "Authenticated users can create quick replies" ON public.quick_replies;
CREATE POLICY "Authenticated users can create quick replies" 
ON public.quick_replies 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrigir função normalize_phone para ter search_path
CREATE OR REPLACE FUNCTION public.normalize_phone(phone_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
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