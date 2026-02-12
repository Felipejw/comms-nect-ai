
-- Fix: Allow groups to bypass phone normalization in prevent_duplicate_contacts
CREATE OR REPLACE FUNCTION public.prevent_duplicate_contacts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_contact_id UUID;
  clean_phone TEXT;
  clean_lid TEXT;
BEGIN
  -- Grupos não precisam de normalização de telefone
  IF NEW.is_group = true THEN
    RETURN NEW;
  END IF;

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
$function$;
