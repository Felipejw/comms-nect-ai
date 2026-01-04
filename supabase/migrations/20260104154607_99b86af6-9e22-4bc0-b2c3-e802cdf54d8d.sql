-- Function to prevent duplicate contacts and merge automatically
CREATE OR REPLACE FUNCTION public.prevent_duplicate_contacts()
RETURNS TRIGGER AS $$
DECLARE
  existing_contact_id UUID;
  clean_phone TEXT;
BEGIN
  -- Skip if no phone provided
  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Clean phone number
  clean_phone := regexp_replace(NEW.phone, '\D', '', 'g');
  
  -- Check if phone is a valid real number (not a LID)
  -- LIDs are typically 14+ digits without a valid country code pattern
  IF length(clean_phone) > 15 THEN
    -- This is likely a LID - store in whatsapp_lid instead of phone
    NEW.whatsapp_lid := clean_phone;
    NEW.phone := NULL;
    RETURN NEW;
  END IF;
  
  -- Check if there's already a contact with this phone number
  SELECT id INTO existing_contact_id
  FROM public.contacts
  WHERE phone = clean_phone 
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  
  IF existing_contact_id IS NOT NULL THEN
    -- Update existing contact with LID if provided and not set
    IF NEW.whatsapp_lid IS NOT NULL THEN
      UPDATE public.contacts 
      SET whatsapp_lid = COALESCE(whatsapp_lid, NEW.whatsapp_lid),
          updated_at = now()
      WHERE id = existing_contact_id 
        AND whatsapp_lid IS NULL;
    END IF;
    
    -- Return NULL to cancel this insert (duplicate prevention)
    RETURN NULL;
  END IF;
  
  -- Also check if there's a contact with this LID stored as phone
  IF NEW.whatsapp_lid IS NOT NULL THEN
    SELECT id INTO existing_contact_id
    FROM public.contacts
    WHERE phone = NEW.whatsapp_lid
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;
    
    IF existing_contact_id IS NOT NULL THEN
      -- Update that contact with the real phone and correct LID
      UPDATE public.contacts 
      SET phone = NEW.phone,
          whatsapp_lid = NEW.whatsapp_lid,
          updated_at = now()
      WHERE id = existing_contact_id;
      
      -- Cancel this insert
      RETURN NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger only if it doesn't exist
DROP TRIGGER IF EXISTS check_duplicate_contacts ON public.contacts;
CREATE TRIGGER check_duplicate_contacts
BEFORE INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_contacts();

-- Add comment
COMMENT ON FUNCTION public.prevent_duplicate_contacts() IS 'Prevents duplicate contacts by merging based on phone/LID and corrects LID stored as phone';